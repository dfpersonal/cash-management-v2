Fetch and display ClickUp task details by running the clickup-agent.py script.

Run the following command to fetch task details:
```bash
python3 /Users/david/Websites/claude-code-documentation/clickup-agent.py {{task_id}}
```

After displaying the task details, implement the requirements described in the task. When the work is complete, ask the user if they want to mark the task as complete in ClickUp.

If the user confirms they want to mark it complete, run:
```bash
python3 /Users/david/Websites/claude-code-documentation/clickup-agent.py {{task_id}} --complete
```
