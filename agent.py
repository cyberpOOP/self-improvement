import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["OPENAI_API_KEY"]
)

files = {}

TARGETS = [
    "README.md",
    "server.js",
    "package.json",
]

DIRECTORIES = [
    "utils",
    "plugins",
    "auth",
    "services",
    "mongodb_schemas"
]

for f in TARGETS:
    try:
        with open(f, "r", encoding="utf-8") as file:
            files[f] = file.read()
    except FileNotFoundError:
        pass

for directory in DIRECTORIES:
    if not os.path.isdir(directory):
        continue

    for root, _, filenames in os.walk(directory):
        for filename in filenames:
            path = os.path.join(root, filename)

            try:
                with open(path, "r", encoding="utf-8") as file:
                    files[path] = file.read()
            except Exception:
                pass

prompt = f"""
You are a code improvement agent working on a Node.js/Express codebase.

Here are the current files:
{files}

Implement ONE small, concrete addition toward:
- auth
- error handling
- logging
- validation
- security

Examples:
- add JWT middleware
- wrap a route in try/catch
- add request logging
- add helmet middleware
- add centralized error handler

Rules:
- modify only ONE file
- keep changes minimal and safe
- do not break existing functionality

Output format:
Line 1: relative file path
Remaining lines: full updated file content

Output nothing else.
"""

response = client.chat.completions.create(
    model="gpt-4.1-mini",
    temperature=0.3,
    messages=[
        {
            "role": "system",
            "content": (
                "You are a senior backend engineer making safe "
                "incremental improvements."
            ),
        },
        {
            "role": "user",
            "content": prompt,
        },
    ],
)

output = response.choices[0].message.content.strip()

lines = output.split("\n", 1)

if len(lines) == 2:
    path, content = lines

    with open(path.strip(), "w", encoding="utf-8") as file:
        file.write(content)

    print(f"Improved: {path.strip()}")
else:
    print("Invalid response from model")