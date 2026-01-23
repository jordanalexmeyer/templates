"""
Form manager for handling questionnaire logic and state
"""

from pathlib import Path
from typing import Any, Dict, List, Optional

from loguru import logger
import yaml


class FormManager:
    """Manages form state and question flow logic"""

    def __init__(self, form_path: str):
        """
        Initialize form manager with a YAML form configuration

        Args:
            form_path: Path to the form YAML file
        """
        self.form_path = Path(form_path)
        self.form_config = self._load_form_config()
        self.answers: Dict[str, Any] = {}
        self.current_question_index = 0
        self.questions = self._flatten_questions(self.form_config["questionnaire"]["questions"])

        logger.info(f"📋 FormManager initialized with {len(self.questions)} questions")

    def _load_form_config(self) -> Dict[str, Any]:
        """Load form configuration from YAML file"""
        try:
            with open(self.form_path, "r") as file:
                config = yaml.safe_load(file)
                logger.debug(f"📄 Loaded form config: {config['questionnaire']['text']}")
                return config
        except Exception as e:
            logger.error(f"❌ Failed to load form config from {self.form_path}: {e}")
            raise

    def _flatten_questions(
        self, questions: List[Dict[str, Any]], parent_path: str = ""
    ) -> List[Dict[str, Any]]:
        """Flatten nested question groups into a linear list"""
        flattened = []

        for question in questions:
            if question.get("type") == "group":
                # Recursively flatten group questions
                group_path = f"{parent_path}.{question['id']}" if parent_path else question["id"]
                flattened.extend(self._flatten_questions(question["questions"], group_path))
            else:
                # Add the parent path to the question ID if it exists
                if parent_path:
                    question = question.copy()
                    question["full_id"] = f"{parent_path}.{question['id']}"
                else:
                    question["full_id"] = question["id"]
                flattened.append(question)

        return flattened

    def get_current_question(self) -> Optional[Dict[str, Any]]:
        """Get the current question that should be asked"""
        while self.current_question_index < len(self.questions):
            question = self.questions[self.current_question_index]

            # Check if question should be shown based on dependencies
            if self._should_show_question(question):
                return question
            else:
                # Skip this question and move to next
                logger.debug(f"⏭️ Skipping question {question['id']} due to dependency conditions")
                self.current_question_index += 1

        return None  # No more questions

    def _should_show_question(self, question: Dict[str, Any]) -> bool:
        """Check if question should be shown based on dependency conditions"""
        if "dependsOn" not in question:
            return True

        dependency = question["dependsOn"]
        dep_question_id = dependency["questionId"]
        dep_value = dependency["value"]
        operator = dependency.get("operator", "equals")

        # Get the answer to the dependency question
        dep_answer = self.answers.get(dep_question_id)

        if dep_answer is None:
            return False  # Dependency question not answered yet

        # Check the condition
        if operator == "equals":
            return dep_answer == dep_value
        elif operator == "not_equals":
            return dep_answer != dep_value
        elif operator == "in":
            return dep_answer in dep_value if isinstance(dep_value, list) else False
        elif operator == "not_in":
            return dep_answer not in dep_value if isinstance(dep_value, list) else True

        logger.warning(f"⚠️ Unknown operator in dependency: {operator}")
        return True

    def record_answer(self, answer: str) -> bool:
        """
        Record answer for current question and move to next

        Args:
            answer: The user's answer

        Returns:
            bool: True if answer was recorded successfully
        """
        current_question = self.get_current_question()
        if not current_question:
            logger.warning("⚠️ No current question to record answer for")
            return False

        question_id = current_question["id"]
        question_type = current_question["type"]

        # Validate and convert answer based on question type
        processed_answer = self._process_answer(answer, question_type, current_question)
        if processed_answer is None:
            logger.warning(f"⚠️ Invalid answer '{answer}' for question type '{question_type}'")
            return False

        # Store the answer
        self.answers[question_id] = processed_answer
        logger.info(f"✅ Recorded answer for '{question_id}': {processed_answer}")

        # Move to next question
        self.current_question_index += 1

        return True

    def _process_answer(self, answer: str, question_type: str, question: Dict[str, Any]) -> Any:
        """Process and validate answer based on question type"""
        answer = answer.strip()

        if question_type == "string":
            return answer
        elif question_type == "number":
            try:
                num_answer = float(answer)
                if "min" in question and num_answer < question["min"]:
                    return None
                if "max" in question and num_answer > question["max"]:
                    return None
                return int(num_answer) if num_answer.is_integer() else num_answer
            except ValueError:
                return None
        elif question_type == "boolean":
            lower_answer = answer.lower()
            if lower_answer in ["yes", "true", "y", "1"]:
                return True
            elif lower_answer in ["no", "false", "n", "0"]:
                return False
            return None
        elif question_type == "select":
            # Check if answer matches one of the options
            options = question.get("options", [])
            for option in options:
                if answer.lower() == option["text"].lower() or answer.lower() == option["value"].lower():
                    return option["value"]
            return None
        elif question_type == "date":
            # For now, just store as string - could add date parsing later
            return answer

        return answer

    def get_form_summary(self) -> Dict[str, Any]:
        """Get a summary of all recorded answers"""
        return {
            "form_id": self.form_config["questionnaire"]["id"],
            "form_title": self.form_config["questionnaire"]["text"],
            "answers": self.answers.copy(),
            "total_questions": len(self.questions),
            "answered_questions": len(self.answers),
            "is_complete": self.current_question_index >= len(self.questions),
        }

    def is_form_complete(self) -> bool:
        """Check if all required questions have been answered"""
        return self.get_current_question() is None

    def format_question_for_llm(self, question: Dict[str, Any]) -> str:
        """Format question text for the LLM to ask the user"""
        question_text = question["text"]
        question_type = question["type"]

        if question_type == "select" and "options" in question:
            options_text = ", ".join([opt["text"] for opt in question["options"]])
            question_text += f" Options: {options_text}"
        elif question_type == "boolean":
            question_text += " (Please answer yes or no)"
        elif question_type == "number":
            range_text = ""
            if "min" in question and "max" in question:
                range_text = f" (between {question['min']} and {question['max']})"
            elif "min" in question:
                range_text = f" (minimum {question['min']})"
            elif "max" in question:
                range_text = f" (maximum {question['max']})"
            question_text += range_text

        return question_text
