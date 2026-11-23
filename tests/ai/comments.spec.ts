// @ai-generated proposal:comments-20261123-0932 — requires human review before merge
import { test, expect } from '@fixtures/apiFixtures';
import '@utils/customMatchers';
import { faker } from '@faker-js/faker';
import type { User, ErrorResponse } from '@constants/UserTypes';
import type { Post } from '@constants/PostTypes';
import type { Comment, CreateCommentRequest } from '@constants/CommentTypes';
import { Endpoint } from '@constants/Endpoint';
import { Schema } from '@constants/Schema';
import { logger } from '@utils/logger';
import { DataGenerator } from '@utils/dataGenerator';
import type { ApiBuilder } from '@utils/apiBuilder';

const NON_EXISTENT_ID = 999999999;

const generateComment = (overrides?: Partial<CreateCommentRequest>): CreateCommentRequest => ({
  name: DataGenerator.generateName(),
  email: DataGenerator.generateEmail(),
  body: faker.lorem.paragraph(),
  ...overrides,
});

test.describe('COMMENTS - AI generated', () => {
  // deleting a user cascades to its posts and comments, so users are the only thing we clean up
  let createdUserIds: number[] = [];

  const createPost = async (api: ApiBuilder): Promise<Post> => {
    const user = await api
      .reset()
      .path(Endpoint.USERS)
      .body(DataGenerator.generateActiveUser())
      .postRequestJson<User>(201);
    createdUserIds.push(user.id);

    return api
      .reset()
      .path(`${Endpoint.USERS}/${user.id}/posts`)
      .body({ title: faker.lorem.sentence({ min: 3, max: 6 }), body: faker.lorem.paragraph() })
      .postRequestJson<Post>(201);
  };

  test.afterEach(async ({ api }) => {
    for (const userId of createdUserIds) {
      try {
        await api
          .reset()
          .path(`${Endpoint.USERS}/${userId}`)
          .deleteRequest(204);
      } catch (error) {
        logger.warn(`Failed to delete user ${userId}:`, error);
      }
    }
    createdUserIds = [];
  });

  test('POST - Should create comment for existing post', { tag: ['@ai-generated', '@req:COMMENTS-01', '@case:COMMENTS-TC-01'] }, async ({ api }) => {
    const post = await createPost(api);
    const newComment = generateComment();

    const createdComment = await api
      .reset()
      .path(`${Endpoint.POSTS}/${post.id}/comments`)
      .body(newComment)
      .postRequestJson<Comment>(201);

    await expect(createdComment).shouldMatchSchema(Schema.COMMENT);
    expect(createdComment.id).toBeDefined();
    expect(createdComment.post_id).shouldEqual(post.id);
    expect(createdComment.name).shouldEqual(newComment.name);
    expect(createdComment.email).shouldEqual(newComment.email);
    expect(createdComment.body).shouldEqual(newComment.body);
  });

  test('POST - Should fail with 422 for invalid email format', { tag: ['@ai-generated', '@req:COMMENTS-02', '@case:COMMENTS-TC-02'] }, async ({ api }) => {
    const post = await createPost(api);

    const errors = await api
      .reset()
      .path(`${Endpoint.POSTS}/${post.id}/comments`)
      .body(generateComment({ email: DataGenerator.generateInvalidEmail() }))
      .postRequestJson<ErrorResponse[]>(422);

    await expect(errors).shouldMatchSchema(Schema.ERROR);
    const emailError = errors.find(e => e.field === 'email');
    expect(emailError).toBeDefined();
    expect(emailError?.message).shouldContain('invalid');
  });

  test('POST - Should fail with 422 when body is missing', { tag: ['@ai-generated', '@req:COMMENTS-03', '@case:COMMENTS-TC-03'] }, async ({ api }) => {
    const post = await createPost(api);

    const errors = await api
      .reset()
      .path(`${Endpoint.POSTS}/${post.id}/comments`)
      .body({ name: DataGenerator.generateName(), email: DataGenerator.generateEmail() })
      .postRequestJson<ErrorResponse[]>(422);

    await expect(errors).shouldMatchSchema(Schema.ERROR);
    expect(errors.some(e => e.field === 'body')).toBeTruthy();
  });

  test('POST - Should fail with 422 when post does not exist', { tag: ['@ai-generated', '@req:COMMENTS-04', '@case:COMMENTS-TC-04'] }, async ({ api }) => {
    const errors = await api
      .path(Endpoint.COMMENTS)
      .body({ post_id: NON_EXISTENT_ID, ...generateComment() })
      .postRequestJson<ErrorResponse[]>(422);

    await expect(errors).shouldMatchSchema(Schema.ERROR);
    const postError = errors.find(e => e.field === 'post');
    expect(postError).toBeDefined();
    expect(postError?.message).shouldContain('must exist');
  });

  test('POST - Should fail with 401 when unauthorized', { tag: ['@ai-generated', '@req:COMMENTS-05', '@case:COMMENTS-TC-05'] }, async ({ api }) => {
    const response = await api
      .path(`${Endpoint.POSTS}/${NON_EXISTENT_ID}/comments`)
      .body(generateComment())
      .withoutAuth()
      .postRequest(401);

    const body = await response.json();
    expect(body.message).toBeDefined();
    expect(body.message.toLowerCase()).shouldContain('authentication');
  });

  test('GET - Should list only comments of the given post', { tag: ['@ai-generated', '@req:COMMENTS-06', '@case:COMMENTS-TC-06'] }, async ({ api }) => {
    const post = await createPost(api);
    const otherPost = await createPost(api);

    const comment = await api
      .reset()
      .path(`${Endpoint.POSTS}/${post.id}/comments`)
      .body(generateComment())
      .postRequestJson<Comment>(201);
    await api
      .reset()
      .path(`${Endpoint.POSTS}/${otherPost.id}/comments`)
      .body(generateComment())
      .postRequestJson<Comment>(201);

    const comments = await api
      .reset()
      .path(Endpoint.COMMENTS)
      .params({ post_id: post.id })
      .getRequestJson<Comment[]>(200);

    await expect(comments).shouldMatchSchema(Schema.COMMENTS);
    expect(comments.length).toBe(1);
    expect(comments.every(c => c.post_id === post.id)).toBeTruthy();
    expect(comments[0].id).shouldEqual(comment.id);
  });

  test('GET - Should return 404 for non-existent comment', { tag: ['@ai-generated', '@req:COMMENTS-07', '@case:COMMENTS-TC-07'] }, async ({ api }) => {
    const response = await api
      .path(`${Endpoint.COMMENTS}/${NON_EXISTENT_ID}`)
      .getRequest(404);

    const body = await response.json();
    expect(body.message).toBeDefined();
    expect(body.message).shouldEqual('Resource not found');
  });
});
