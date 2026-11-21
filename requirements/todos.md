# TODOS — User todos API
Endpoint: /todos  (also /users/{id}/todos)

## Requirements
- **TODOS-01** (P0): An authenticated client can create a todo for an existing user via /users/{id}/todos with title, status and due_on; response 201 contains id, user_id, title, due_on, status.
- **TODOS-02** (P1): A todo created without due_on is accepted (201) and returns due_on as null.
- **TODOS-03** (P1): Creating a todo with a status other than "pending" or "completed" returns 422 with a field error for "status".
- **TODOS-04** (P1): Creating a todo without title returns 422 with a field error for "title".
- **TODOS-05** (P0): Creating a todo without an Authorization header returns 401 with a message.
- **TODOS-06** (P2): GET /todos?status=completed returns only todos with status "completed".
- **TODOS-07** (P2): GET /todos honours page and per_page: at most per_page items are returned and the X-Pagination-Limit header equals per_page.
- **TODOS-08** (P1): GET /todos/{id} for a non-existent id returns 404 with a message.
