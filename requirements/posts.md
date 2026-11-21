# POSTS — User posts API
Endpoint: /posts  (also /users/{id}/posts)

## Requirements
- **POSTS-01** (P0): An authenticated client can create a post for an existing user via /users/{id}/posts; response 201 contains id, user_id, title, body and echoes the submitted title and body.
- **POSTS-02** (P1): Creating a post without title returns 422 with a field error for "title".
- **POSTS-03** (P1): Creating a post for a user id that does not exist returns 422 with a field error for "user".
- **POSTS-04** (P0): Creating a post without an Authorization header returns 401 with a message.
- **POSTS-05** (P1): GET /posts/{id} returns 200 with the post matching the post schema.
- **POSTS-06** (P1): GET /posts/{id} for a non-existent id returns 404 with a message.
- **POSTS-07** (P2): GET /users/{id}/posts returns only posts whose user_id equals that user.
- **POSTS-08** (P2): GET /posts returns the newest posts first (descending id order).

## Notes
Deleting a user also deletes their posts (GoREST cascades), so cleanup can delete the parent user.
