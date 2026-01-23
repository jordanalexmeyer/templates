"""
Form filling tools for recording answers and managing form state
"""

from typing import AsyncGenerator, Union

from loguru import logger
from pydantic import BaseModel, Field

from line.events import AgentResponse, ToolResult


class RecordAnswerArgs(BaseModel):
    """Arguments for the record_answer tool"""

    answer: str = Field(description="The user's answer to the current question")


class RecordAnswerTool:
    """Tool for recording form answers"""

    @staticmethod
    def name() -> str:
        return "record_answer"

    @staticmethod
    def description() -> str:
        return "Record the user's answer to the current form question"

    @staticmethod
    def parameters() -> dict:
        return RecordAnswerArgs.model_json_schema()

    @staticmethod
    def to_gemini_tool():
        """Convert to Gemini tool format"""
        from google.genai import types as gemini_types

        return gemini_types.Tool(
            function_declarations=[
                gemini_types.FunctionDeclaration(
                    name=RecordAnswerTool.name(),
                    description=RecordAnswerTool.description(),
                    parameters=RecordAnswerTool.parameters(),
                )
            ]
        )


async def record_answer(args: RecordAnswerArgs) -> AsyncGenerator[Union[ToolResult, AgentResponse], None]:
    """
    Process the recorded answer - this will be called by the FormFillingNode
    to handle the actual form logic and state management.

    Args:
        args: The tool arguments containing the user's answer

    Yields:
        ToolResult: The result of recording the answer
        AgentResponse: Any response message for the user
    """
    logger.info(f"📝 Recording answer: {args.answer}")

    # The actual form logic will be handled by the FormFillingNode
    # This is just a placeholder that yields the tool result
    yield ToolResult(
        tool_name="record_answer", tool_args={"answer": args.answer}, result=f"Answer recorded: {args.answer}"
    )
