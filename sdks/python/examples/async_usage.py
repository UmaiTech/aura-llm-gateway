"""
Async usage example for the Aura SDK.

This example demonstrates the async client with streaming.
"""

import asyncio
from aura import AsyncAuraClient


async def simple_completion():
    """Simple async completion."""
    print("=== Async Simple Completion ===")

    async with AsyncAuraClient() as client:
        response = await client.responses.create(
            model="gpt-5.4-mini",
            input="What is the speed of light? Answer in one sentence."
        )

        print(f"Response: {response.output_text}")
        print(f"Status: {response.status}")

    print()


async def streaming_completion():
    """Async streaming completion."""
    print("=== Async Streaming ===")

    async with AsyncAuraClient() as client:
        stream = await client.responses.create(
            model="gpt-5.4-mini",
            input="Tell me a very short story (2-3 sentences) about a cat.",
            stream=True
        )

        print("Response: ", end="")
        async for event in stream:
            if event.type == "response.output_text.delta":
                print(event.delta, end="", flush=True)
            elif event.type == "response.completed":
                print()
                print(f"\nCompleted!")

    print()


async def parallel_requests():
    """Make multiple requests in parallel."""
    print("=== Parallel Requests ===")

    async with AsyncAuraClient() as client:
        # Create multiple requests concurrently
        tasks = [
            client.responses.create(
                model="gpt-5.4-mini",
                input=f"What is {i} + {i}? Just give the number."
            )
            for i in range(1, 4)
        ]

        responses = await asyncio.gather(*tasks)

        for i, response in enumerate(responses, 1):
            print(f"Request {i}: {response.output_text.strip()}")

    print()


async def main():
    await simple_completion()
    await streaming_completion()
    await parallel_requests()


if __name__ == "__main__":
    asyncio.run(main())
