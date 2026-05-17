"""
Tool usage example for the Aura SDK.

This example demonstrates how to use function tools with the API.
"""

import json
from aura import AuraClient, Tool


# Initialize client
client = AuraClient()


def define_tools():
    """Define example tools."""

    # Weather tool
    weather_tool = Tool.function_tool(
        name="get_weather",
        description="Get the current weather for a location",
        parameters={
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "The city and state, e.g. San Francisco, CA"
                },
                "unit": {
                    "type": "string",
                    "description": "Temperature unit",
                    "enum": ["celsius", "fahrenheit"]
                }
            },
            "required": ["location"]
        }
    )

    # Calculator tool
    calculator_tool = Tool.function_tool(
        name="calculate",
        description="Perform a mathematical calculation",
        parameters={
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "The math expression to evaluate, e.g. '2 + 2'"
                }
            },
            "required": ["expression"]
        }
    )

    return [weather_tool, calculator_tool]


def simulate_tool_call(name: str, arguments: str) -> str:
    """Simulate executing a tool call."""
    args = json.loads(arguments)

    if name == "get_weather":
        location = args.get("location", "Unknown")
        unit = args.get("unit", "fahrenheit")
        temp = 72 if unit == "fahrenheit" else 22
        return json.dumps({
            "location": location,
            "temperature": temp,
            "unit": unit,
            "conditions": "sunny"
        })

    elif name == "calculate":
        expression = args.get("expression", "0")
        try:
            # WARNING: In production, use a safe math parser!
            result = eval(expression)
            return json.dumps({"result": result})
        except Exception as e:
            return json.dumps({"error": str(e)})

    return json.dumps({"error": "Unknown tool"})


def tool_calling_example():
    """Example of handling tool calls."""
    print("=== Tool Calling Example ===")

    tools = define_tools()

    # Request that may trigger a tool call
    response = client.responses.create(
        model="gpt-5.4-mini",
        input="What's the weather like in Tokyo?",
        tools=tools
    )

    print(f"Initial response status: {response.status}")

    if response.has_tool_calls:
        print(f"Tool calls: {len(response.tool_calls)}")

        for tool_call in response.tool_calls:
            print(f"\nTool: {tool_call.name}")
            print(f"Arguments: {tool_call.arguments}")

            # Execute the tool
            result = simulate_tool_call(tool_call.name, tool_call.arguments)
            print(f"Result: {result}")
    else:
        print(f"Response: {response.output_text}")

    print()


def multi_tool_example():
    """Example with multiple tools in one request."""
    print("=== Multi-Tool Example ===")

    tools = define_tools()

    response = client.responses.create(
        model="gpt-5.4-mini",
        input="What's the weather in New York? Also, what is 15 * 7?",
        tools=tools
    )

    if response.has_tool_calls:
        print(f"Number of tool calls: {len(response.tool_calls)}")

        for i, tool_call in enumerate(response.tool_calls, 1):
            print(f"\n{i}. {tool_call.name}:")
            print(f"   Args: {tool_call.arguments}")
            result = simulate_tool_call(tool_call.name, tool_call.arguments)
            print(f"   Result: {result}")
    else:
        print(f"Response: {response.output_text}")

    print()


if __name__ == "__main__":
    tool_calling_example()
    multi_tool_example()
