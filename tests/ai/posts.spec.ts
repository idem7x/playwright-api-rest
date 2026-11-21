// @ai-generated proposal:posts-20261121-2254 — requires human review before merge
import { test, expect } from '@fixtures/apiFixtures';
import '@utils/customMatchers';
import { faker } from '@faker-js/faker';
import type { User, ErrorResponse } from '@constants/UserTypes';
import type { Post, CreatePostRequest } from '@constants/PostTypes';
import { Endpoint } from '@constants/Endpoint';
import { Schema } from '@constants/Schema';
import { logger } from '@utils/logger';
import { DataGenerator } from '@utils/dataGenerator';
import type { ApiBuilder } from '@utils/apiBuilder';

const NON_EXISTENT_ID = 999999999;

const generatePost = (overrides?: Partial<CreatePostRequest>): CreatePostRequest => ({
  title: faker.lorem.sentence({ min: 3, max: 6 }),
  body: faker.lorem.paragraph(),
  ...overrides,
});

test.describe('POSTS - AI generated', () => {
  // deleting a user cascades to its posts, so users are the only thing we clean up
  let createdUserIds: number[] = [];

  const createUser = async (api: ApiBuilder): Promise<User> => {
    const user = await api
      .reset()
      .path(Endpoint.USERS)
      .body(DataGenerator.generateActiveUser())
      .postRequestJson<User>(201);
    createdUserIds.push(user.id);
    return user;
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

  test('POST - Should create post for existing user', { tag: ['@ai-generated', '@req:POSTS-01', '@case:POSTS-TC-01'] }, async ({ api }) => {
    const user = await createUser(api);
    const newPost = generatePost();

    const createdPost = await api
      .reset()
      .path(`${Endpoint.USERS}/${user.id}/posts`)
      .body(newPost)
      .postRequestJson<Post>(201);

    await expect(createdPost).shouldMatchSchema(Schema.POST);
    expect(createdPost.id).toBeDefined();
    expect(createdPost.user_id).shouldEqual(user.id);
    expect(createdPost.title).shouldEqual(newPost.title);
    expect(createdPost.body).shouldEqual(newPost.body);
  });

  test('POST - Should fail with 422 when title is missing', { tag: ['@ai-generated', '@req:POSTS-02', '@case:POSTS-TC-02'] }, async ({ api }) => {
    const user = await createUser(api);

    const errors = await api
      .reset()
      .path(`${Endpoint.USERS}/${user.id}/posts`)
      .body({ body: faker.lorem.paragraph() })
      .postRequestJson<ErrorResponse[]>(422);

    await expect(errors).shouldMatchSchema(Schema.ERROR);
    expect(errors.some(e => e.field === 'title')).toBeTruthy();
  });

  test('POST - Should fail with 422 when user does not exist', { tag: ['@ai-generated', '@req:POSTS-03', '@case:POSTS-TC-03'] }, async ({ api }) => {
    const errors = await api
      .path(Endpoint.POSTS)
      .body({ user_id: NON_EXISTENT_ID, ...generatePost() })
      .postRequestJson<ErrorResponse[]>(422);

    await expect(errors).shouldMatchSchema(Schema.ERROR);
    const userError = errors.find(e => e.field === 'user');
    expect(userError).toBeDefined();
    expect(userError?.message).shouldContain('must exist');
  });

  test('POST - Should fail with 401 when unauthorized', { tag: ['@ai-generated', '@req:POSTS-04', '@case:POSTS-TC-04'] }, async ({ api }) => {
    const response = await api
      .path(`${Endpoint.USERS}/${NON_EXISTENT_ID}/posts`)
      .body(generatePost())
      .withoutAuth()
      .postRequest(401);

    const body = await response.json();
    expect(body.message).toBeDefined();
    expect(body.message.toLowerCase()).shouldContain('authentication');
  });

  test('GET - Should retrieve post by ID', { tag: ['@ai-generated', '@req:POSTS-05', '@case:POSTS-TC-05'] }, async ({ api }) => {
    const user = await createUser(api);
    const createdPost = await api
      .reset()
      .path(`${Endpoint.USERS}/${user.id}/posts`)
      .body(generatePost())
      .postRequestJson<Post>(201);

    const post = await api
      .reset()
      .path(`${Endpoint.POSTS}/${createdPost.id}`)
      .getRequestJson<Post>(200);

    await expect(post).shouldMatchSchema(Schema.POST);
    expect(post).shouldEqual(createdPost);
  });

  test('GET - Should return 404 for non-existent post', { tag: ['@ai-generated', '@req:POSTS-06', '@case:POSTS-TC-06'] }, async ({ api }) => {
    const response = await api
      .path(`${Endpoint.POSTS}/${NON_EXISTENT_ID}`)
      .getRequest(404);

    const body = await response.json();
    expect(body.message).toBeDefined();
  });

  test('GET - Should list only posts of the given user', { tag: ['@ai-generated', '@req:POSTS-07', '@case:POSTS-TC-07'] }, async ({ api }) => {
    const user = await createUser(api);
    const titles: string[] = [];
    for (const post of [generatePost(), generatePost()]) {
      const created = await api
        .reset()
        .path(`${Endpoint.USERS}/${user.id}/posts`)
        .body(post)
        .postRequestJson<Post>(201);
      titles.push(created.title);
    }

    const posts = await api
      .reset()
      .path(`${Endpoint.USERS}/${user.id}/posts`)
      .getRequestJson<Post[]>(200);

    await expect(posts).shouldMatchSchema(Schema.POSTS);
    expect(posts.length).toBe(2);
    expect(posts.every(p => p.user_id === user.id)).toBeTruthy();
    expect(posts.map(p => p.title).sort()).shouldEqual([...titles].sort());
  });

  test('POST - Should create post via /posts with user_id in body', { tag: ['@ai-generated', '@req:POSTS-01', '@case:POSTS-TC-08'] }, async ({ api }) => {
    const user = await createUser(api);
    const newPost = { user_id: user.id, ...generatePost() };

    const createdPost = await api
      .reset()
      .path(Endpoint.POSTS)
      .body(newPost)
      .postRequestJson<Post>(201);

    await expect(createdPost).shouldMatchSchema(Schema.POST);
    expect(createdPost.user_id).shouldEqual(user.id);
    expect(createdPost.title).shouldEqual(newPost.title);
  });
});
