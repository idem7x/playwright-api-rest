export type PostData = {
  title: string;
  body: string;
};

export type Post = PostData & {
  id: number;
  user_id: number;
};

export type CreatePostRequest = PostData;
export type CreatePostWithUserRequest = PostData & { user_id: number };
