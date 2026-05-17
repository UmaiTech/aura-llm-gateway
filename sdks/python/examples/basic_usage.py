"""
Basic usage example for the Aura SDK.

This example demonstrates simple completion and streaming.
"""

from aura import AuraClient

# Initialize client (uses AURA_BASE_URL or defaults to localhost:8080)
client = AuraClient()


def simple_completion():
    """Simple non-streaming completion."""
    print("=== Simple Completion ===")

    response = client.responses.create(
        model="gpt-5.4-mini",
        input="What is 2 + 2? Answer briefly."
    )

    print(f"Response: {response.output_text}")
    print(f"Model: {response.model}")
    print(f"Status: {response.status}")

    if response.usage:
        print(f"Tokens: {response.usage.input_tokens} in, {response.usage.output_tokens} out")
        if response.usage.cost_usd:
            print(f"Cost: ${response.usage.cost_usd:.6f}")

    print()


def streaming_completion():
    """Streaming completion with text deltas."""
    print("=== Streaming Completion ===")

    print("Response: ", end="")

    for event in client.responses.create(
        model="gpt-5.4-mini",
        input="Count from 1 to 5, one number per line.",
        stream=True
    ):
        if event.type == "response.output_text.delta":
            print(event.delta, end="", flush=True)
        elif event.type == "response.completed":
            print()
            print(f"\nCompleted! Status: {event.response.status}")
            if event.response.usage:
                print(f"Total tokens: {event.response.usage.total_tokens}")

    print()


def conversation_threading():
    """Multi-turn conversation using previous_response_id."""
    print("=== Conversation Threading ===")

    # First turn
    response1 = client.responses.create(
        model="gpt-5.4-mini",
        input="My favorite color is blue. Remember this."
    )
    print(f"Turn 1: {response1.output_text}")

    # Second turn - continues the conversation
    response2 = client.responses.create(
        model="gpt-5.4-mini",
        input="What is my favorite color?",
        previous_response_id=response1.id
    )
    print(f"Turn 2: {response2.output_text}")

    print()


def with_system_instructions():
    """Using system instructions."""
    print("=== System Instructions ===")

    response = client.responses.create(
        model="gpt-5.4-mini",
        input="Hello, how are you?",
        instructions="You are a helpful assistant who responds only in haiku format."
    )

    print(f"Response:\n{response.output_text}")
    print()


if __name__ == "__main__":
    simple_completion()
    streaming_completion()
    conversation_threading()
    with_system_instructions()
