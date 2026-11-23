export type CommentData = {
  name: string;
  email: string;
  body: string;
};

export type Comment = CommentData & {
  id: number;
  post_id: number;
};

export type CreateCommentRequest = CommentData;
export type CreateCommentWithPostRequest = CommentData & { post_id: number };
