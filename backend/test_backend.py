import io
import json
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from main import app, clean_json_response


class TestCleanJsonResponse(unittest.TestCase):
    def test_clean_direct_json(self):
        data = '{"name": "Alice", "role": "Engineer"}'
        result = clean_json_response(data)
        self.assertEqual(result, {"name": "Alice", "role": "Engineer"})

    def test_clean_markdown_fence(self):
        data = """```json
{
  "first_name": "Bob",
  "skills": ["Python", "React"]
}
```"""
        result = clean_json_response(data)
        self.assertEqual(result["first_name"], "Bob")
        self.assertEqual(result["skills"], ["Python", "React"])

    def test_clean_with_preamble(self):
        data = """Here is the extracted resume profile:
```json
{
  "name": "Carol Danvers",
  "email": "carol@example.com"
}
```
Hope this helps!"""
        result = clean_json_response(data)
        self.assertEqual(result["name"], "Carol Danvers")


class TestBackendEndpoints(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health_check(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["nebius_base_url"], "https://api.studio.nebius.ai/v1/")
        self.assertEqual(data["models"]["ingest"], "deepseek-ai/DeepSeek-V4.1-Flash")
        self.assertEqual(data["models"]["mapping"], "zai-org/GLM-5.3-Flash")

    @patch("main.nebius_client.chat.completions.create", new_callable=AsyncMock)
    @patch.dict("os.environ", {"NEBIUS_API_KEY": "test-key-12345"})
    def test_map_fields_success(self, mock_create):
        # Setup mock model response
        mock_choice = MagicMock()
        mock_choice.message.content = json.dumps({
            "first_name": "Jane",
            "last_name": "Doe",
            "email": "jane@example.com",
            "missing_field": None
        })
        mock_create.return_value = MagicMock(choices=[mock_choice])

        payload = {
            "form_fields": [
                {"id": "first_name", "name": "first_name", "label": "First Name"},
                {"id": "last_name", "name": "last_name", "label": "Last Name"},
                {"id": "email", "name": "email", "label": "Email Address"},
                {"id": "missing_field", "name": "missing", "label": "Unknown"}
            ],
            "user_profile": {
                "name": {"first": "Jane", "last": "Doe"},
                "contact": {"email": "jane@example.com"}
            }
        }

        response = self.client.post("/api/map-fields", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["first_name"], "Jane")
        self.assertEqual(data["last_name"], "Doe")
        self.assertEqual(data["email"], "jane@example.com")
        self.assertIsNone(data["missing_field"])

    @patch("main.nebius_client.chat.completions.create", new_callable=AsyncMock)
    @patch.dict("os.environ", {"NEBIUS_API_KEY": "test-key-12345"})
    def test_ingest_document_txt(self, mock_create):
        mock_choice = MagicMock()
        mock_choice.message.content = json.dumps({
            "name": "John Doe",
            "contact": {"email": "john@doe.com"},
            "work_history": [{"title": "Software Architect"}],
            "skills": ["Python", "FastAPI"],
            "education": [{"degree": "B.S. Computer Science"}]
        })
        mock_create.return_value = MagicMock(choices=[mock_choice])

        fake_cv = b"John Doe\nSoftware Architect\njohn@doe.com\nSkills: Python, FastAPI\nEducation: B.S. Computer Science"
        files = {"file": ("resume.txt", io.BytesIO(fake_cv), "text/plain")}

        response = self.client.post("/api/ingest-document", files=files)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "John Doe")
        self.assertEqual(data["skills"], ["Python", "FastAPI"])


if __name__ == "__main__":
    unittest.main()
