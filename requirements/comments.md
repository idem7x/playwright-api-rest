# COMMENTS — Post comments API
Endpoint: /comments  (also /posts/{id}/comments)

## Requirements
- **COMMENTS-01** (P0): An authenticated client can create a comment on an existing post via /posts/{id}/comments; response 201 contains id, post_id, name, email, body.
- **COMMENTS-02** (P1): Creating a comment with an invalid email returns 422 with a field error for "email".
- **COMMENTS-03** (P1): Creating a comment without body returns 422 with a field error for "body".
- **COMMENTS-04** (P1): Creating a comment for a post id that does not exist returns 422 with a field error for "post".
- **COMMENTS-05** (P0): Creating a comment without an Authorization header returns 401 with a message.
- **COMMENTS-06** (P2): GET /comments?post_id={id} returns only comments of that post.
- **COMMENTS-07** (P1): GET /comments/{id} for a non-existent id returns 404 with a message.

## Notes
A comment needs a post, a post needs a user. Deleting the user cascades to posts and comments.
