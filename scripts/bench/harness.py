"""LLM gateway benchmark harness.

Runs 1k requests × 5 scenarios × N gateways × R runs against the same provider
(Anthropic Claude Haiku 4.5) and writes results.json in the shape consumed by
LoadTestChart.astro.

See README.md for the full setup.
"""

from __future__ import annotations

import asyncio
import json
import statistics
import time
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

import click
import httpx
from dotenv import load_dotenv
from rich.console import Console
from rich.progress import BarColumn, Progress, TextColumn, TimeRemainingColumn
from rich.table import Table

from gateway_adapters import (
    MODEL,
    GatewayAdapter,
    GatewayResponse,
    build_adapters,
)

console = Console()

SCENARIOS = [1, 2, 3, 4, 5]
DEFAULT_REQUESTS = 1000
DEFAULT_WARMUP = 100
DEFAULT_CONCURRENCY = 50
DEFAULT_RUNS = 3
RESULTS_DIR = Path(__file__).parent / "results"


async def run_one(
    adapter: GatewayAdapter,
    client: httpx.AsyncClient,
    tool_calls: int,
    sem: asyncio.Semaphore,
) -> GatewayResponse:
    async with sem:
        return await adapter.call(client, tool_calls)


async def run_batch(
    adapter: GatewayAdapter,
    tool_calls: int,
    n: int,
    concurrency: int,
    progress: Progress | None = None,
    task_id: int | None = None,
) -> list[GatewayResponse]:
    """Fire `n` requests at `adapter` with bounded concurrency."""
    sem = asyncio.Semaphore(concurrency)
    limits = httpx.Limits(max_connections=concurrency * 2, max_keepalive_connections=concurrency)
    timeout = httpx.Timeout(60.0, connect=10.0)

    async with httpx.AsyncClient(limits=limits, timeout=timeout) as client:
        tasks = [run_one(adapter, client, tool_calls, sem) for _ in range(n)]
        results: list[GatewayResponse] = []
        for coro in asyncio.as_completed(tasks):
            r = await coro
            results.append(r)
            if progress and task_id is not None:
                progress.advance(task_id)
        return results


def aggregate(results: list[GatewayResponse], wall_clock_s: float) -> dict:
    """Turn a list of per-request results into the four headline metrics."""
    ok = [r for r in results if r.status == 200 and not r.error]
    if not ok:
        return {"p50": 0, "p99": 0, "overhead": 0, "rps": 0, "errors": len(results)}

    totals = sorted(r.total_ms for r in ok)
    latencies = sorted(r.latency_ms for r in ok)
    p50_total = totals[len(totals) // 2]
    p99_total = totals[int(len(totals) * 0.99)]
    # overhead = gateway-reported latency vs total round-trip
    # For gateways that don't separate (Bifrost, Portkey, OpenRouter):
    # we approximate overhead by `total - p10(total)` as a proxy floor.
    # Aura and LiteLLM expose real gateway-vs-provider split via latency_ms.
    p50_latency = latencies[len(latencies) // 2]
    overhead = max(0.0, p50_total - p50_latency) if any(r.latency_ms < r.total_ms for r in ok) else \
               max(0.0, p50_total - totals[int(len(totals) * 0.10)])

    return {
        "p50": int(round(p50_total)),
        "p99": int(round(p99_total)),
        "overhead": int(round(overhead)),
        "rps": int(round(len(ok) / wall_clock_s)),
        "errors": len(results) - len(ok),
    }


async def run_full(
    adapters: list[GatewayAdapter],
    n: int,
    warmup: int,
    concurrency: int,
    runs: int,
    out_dir: Path,
) -> dict:
    """The full benchmark."""
    out_dir.mkdir(parents=True, exist_ok=True)

    # Per-run results, then median across runs.
    per_run: dict[int, dict[str, dict[int, dict]]] = {}

    for run_idx in range(runs):
        console.rule(f"[bold purple]Run {run_idx + 1} / {runs}")
        per_run[run_idx] = {}

        for adapter in adapters:
            per_run[run_idx][adapter.name] = {}

            with Progress(
                TextColumn("[bold]{task.fields[gateway]}[/] · {task.fields[scenario]} tool calls"),
                BarColumn(),
                TextColumn("{task.completed}/{task.total}"),
                TimeRemainingColumn(),
                console=console,
            ) as progress:
                for tc in SCENARIOS:
                    # Warm up — discard
                    await run_batch(adapter, tc, warmup, concurrency)

                    task_id = progress.add_task(
                        "", total=n, gateway=adapter.name, scenario=tc,
                    )
                    t0 = time.perf_counter()
                    raw = await run_batch(
                        adapter, tc, n, concurrency, progress=progress, task_id=task_id,
                    )
                    wall = time.perf_counter() - t0

                    agg = aggregate(raw, wall)
                    per_run[run_idx][adapter.name][tc] = agg

                    # Persist raw per-request data for forensics
                    raw_path = out_dir / f"{adapter.name.replace(' ', '_')}__tc{tc}__run{run_idx}.jsonl"
                    with raw_path.open("w") as f:
                        for r in raw:
                            f.write(json.dumps(asdict(r)) + "\n")

                    if agg["errors"]:
                        console.print(
                            f"[yellow]  ! {agg['errors']}/{n} errors on "
                            f"{adapter.name} tc={tc}[/]"
                        )

    # Aggregate across runs — median of medians, plus stdev sanity check
    return summarize(per_run, adapters)


def summarize(per_run: dict, adapters: list[GatewayAdapter]) -> dict:
    """Reduce R runs to one scenarios[] array matching LoadTestChart.astro."""
    scenarios = []
    runs = sorted(per_run.keys())

    for tc in SCENARIOS:
        results = {}
        for adapter in adapters:
            # Collect each metric across the R runs
            metrics = {k: [] for k in ("p50", "p99", "overhead", "rps")}
            for run_idx in runs:
                agg = per_run[run_idx].get(adapter.name, {}).get(tc)
                if not agg:
                    continue
                for k in metrics:
                    metrics[k].append(agg[k])
            if not metrics["p50"]:
                continue
            median = {k: int(round(statistics.median(v))) for k, v in metrics.items()}
            # Stdev sanity flag for overhead — printed but not stored
            if len(metrics["overhead"]) >= 2:
                m = statistics.mean(metrics["overhead"])
                s = statistics.stdev(metrics["overhead"]) if m > 0 else 0
                if m > 0 and (s / m) > 0.15:
                    console.print(
                        f"[yellow]  ! High variance for {adapter.name} tc={tc}: "
                        f"overhead stdev/mean={s/m:.2f} — re-run advised[/]"
                    )
            results[adapter.name] = median

        scenarios.append({"toolCalls": tc, "results": results})

    return {
        "scenarios": scenarios,
        "metadata": {
            "ran_at": datetime.now(timezone.utc).isoformat(),
            "provider": f"anthropic-{MODEL}",
            "harness_version": "0.2.0",
            "runs": len(runs),
        },
    }


def print_summary_table(summary: dict) -> None:
    """Pretty-print results so the run feels worth watching."""
    for sc in summary["scenarios"]:
        table = Table(
            title=f"Tool calls: {sc['toolCalls']}",
            show_header=True, header_style="bold purple",
        )
        table.add_column("Gateway")
        table.add_column("p50 (ms)", justify="right")
        table.add_column("p99 (ms)", justify="right")
        table.add_column("Overhead (ms)", justify="right")
        table.add_column("RPS", justify="right")

        for name, r in sc["results"].items():
            table.add_row(
                name, str(r["p50"]), str(r["p99"]), str(r["overhead"]), str(r["rps"]),
            )
        console.print(table)
        console.print()


async def smoke_test(adapters: list[GatewayAdapter]) -> None:
    """Send 5 requests at tc=1 per gateway, print pass/fail."""
    console.rule("[bold]Smoke test")
    async with httpx.AsyncClient(timeout=60.0) as client:
        for adapter in adapters:
            sem = asyncio.Semaphore(2)
            t0 = time.perf_counter()
            results = await asyncio.gather(*[
                run_one(adapter, client, 1, sem) for _ in range(5)
            ])
            wall = time.perf_counter() - t0
            ok = [r for r in results if r.status == 200 and not r.error]
            if not ok:
                err = results[0].error if results else "no response"
                console.print(f"[red]{adapter.name} ✗[/]  {err}")
                continue
            agg = aggregate(ok, wall)
            console.print(
                f"[green]{adapter.name} ✓[/]  "
                f"p50={agg['p50']}ms overhead={agg['overhead']}ms"
            )


@click.command()
@click.option("--smoke", is_flag=True, help="Just sanity-check that each gateway responds.")
@click.option("--full", is_flag=True, help="Run the full benchmark.")
@click.option("--requests", default=DEFAULT_REQUESTS, help="Requests per scenario.")
@click.option("--warmup", default=DEFAULT_WARMUP, help="Discarded warm-up requests per scenario.")
@click.option("--concurrency", default=DEFAULT_CONCURRENCY, help="In-flight requests.")
@click.option("--runs", default=DEFAULT_RUNS, help="How many full passes (median is taken).")
@click.option("--out", default=str(RESULTS_DIR), help="Output dir.")
@click.option(
    "--gateways",
    default="",
    help="Comma-separated subset of gateway names to run (case-insensitive). Empty = all.",
)
def main(smoke, full, requests, warmup, concurrency, runs, out, gateways):
    load_dotenv()
    adapters = build_adapters()
    if not adapters:
        console.print("[red]No gateways configured — fill in .env and try again.[/]")
        raise SystemExit(1)

    if gateways:
        wanted = {g.strip().lower() for g in gateways.split(",") if g.strip()}
        adapters = [a for a in adapters if a.name.lower() in wanted]
        if not adapters:
            available = ", ".join(a.name for a in build_adapters())
            console.print(
                f"[red]--gateways filter matched nothing.[/]\n"
                f"Available: {available}"
            )
            raise SystemExit(1)

    console.print(f"[bold]Configured gateways:[/] {', '.join(a.name for a in adapters)}")
    console.print(f"[bold]Model:[/] {MODEL}\n")

    if smoke:
        asyncio.run(smoke_test(adapters))
        return

    if not full:
        console.print("Pass --smoke or --full.")
        return

    out_dir = Path(out)
    summary = asyncio.run(run_full(
        adapters, n=requests, warmup=warmup, concurrency=concurrency,
        runs=runs, out_dir=out_dir,
    ))

    results_path = out_dir / "results.json"
    results_path.write_text(json.dumps(summary, indent=2))
    console.print(f"\n[green]✓ Wrote {results_path}[/]\n")

    print_summary_table(summary)


if __name__ == "__main__":
    main()
