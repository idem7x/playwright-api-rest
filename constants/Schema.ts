export const Schema = {
    USER : "userSchema.json",
    USERS : "usersSchema.json",
    ERROR : "errorSchema.json",
    POST : "postSchema.json",
    POSTS : "postsSchema.json",
    COMMENT : "commentSchema.json",
    COMMENTS : "commentsSchema.json"
} as const;

export type Schema = typeof Schema[keyof typeof Schema];
