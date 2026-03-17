class Database:
    def __init__(self):
        self._tasks = {}
        self._users = {}
        self._reports = {}
        self._counter = 0

    def _next_id(self):
        self._counter += 1
        return self._counter

    def get_tasks(self, page=1, per_page=20):
        items = list(self._tasks.values())
        start = (page - 1) * per_page
        return items[start : start + per_page]

    def get_task(self, task_id):
        return self._tasks.get(task_id)

    def create_task(self, data):
        task_id = self._next_id()
        task = {"id": task_id, **data}
        self._tasks[task_id] = task
        return task

    def update_task(self, task_id, data):
        if task_id not in self._tasks:
            return None
        self._tasks[task_id].update(data)
        return self._tasks[task_id]

    def delete_task(self, task_id):
        return self._tasks.pop(task_id, None) is not None

    def get_users(self):
        return list(self._users.values())

    def get_user(self, user_id):
        return self._users.get(user_id)

    def create_user(self, data):
        user_id = self._next_id()
        user = {"id": user_id, **data}
        self._users[user_id] = user
        return user

    def get_tasks_for_user(self, user_id):
        return [t for t in self._tasks.values() if t.get("assigned_to") == user_id]

    def get_task_summary(self, start_date, end_date):
        return {"total": len(self._tasks), "start": start_date, "end": end_date}

    def generate_report(self, format_type):
        return f"/tmp/report.{format_type}"

    def get_scheduled_reports(self):
        return list(self._reports.values())

    def create_scheduled_report(self, data):
        report_id = self._next_id()
        report = {"id": report_id, **data}
        self._reports[report_id] = report
        return report


db = Database()
