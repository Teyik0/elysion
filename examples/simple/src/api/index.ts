import Elysia, { t } from "elysia";
import { generateId, generateSlug, queries } from "../db";
import { authPlugin } from "./auth";

export const api = new Elysia()
  .use(authPlugin)
  .get("/api/posts", () => {
    const posts = queries.getPublishedPosts.all();
    return { posts };
  })
  .get("/api/posts/:id", ({ params }) => {
    const post = queries.getPostById.get(params.id as string);
    if (!post) {
      return { error: "Post not found" };
    }
    return { post };
  })
  .post(
    "/api/posts",
    ({ body, user }) => {
      if (!user) {
        return { error: "Unauthorized" };
      }
      const { title, excerpt, content, tags, published } = body as {
        title: string;
        excerpt: string;
        content: string;
        tags: string;
        published: boolean;
      };
      const id = generateId();
      const slug = generateSlug(title);
      const now = new Date().toISOString();
      const post = queries.createPost.get({
        $id: id,
        $slug: slug,
        $title: title,
        $excerpt: excerpt,
        $content: content,
        $tags: tags,
        $authorId: user.id,
        $published: published ? 1 : 0,
        $createdAt: now,
        $updatedAt: now,
      });
      return { success: true, post };
    },
    {
      requireAuth: true,
      body: t.Object({
        title: t.String(),
        excerpt: t.String(),
        content: t.String(),
        tags: t.String(),
        published: t.Boolean(),
      }),
    }
  )
  .put(
    "/api/posts/:id",
    ({ params, body, user }) => {
      if (!user) {
        return { error: "Unauthorized" };
      }
      const existing = queries.getPostById.get(params.id as string);
      if (!existing) {
        return { error: "Post not found" };
      }
      const { title, excerpt, content, tags, published } = body as {
        title: string;
        excerpt: string;
        content: string;
        tags: string;
        published: boolean;
      };
      const slug = generateSlug(title);
      const now = new Date().toISOString();
      const post = queries.updatePost.get({
        $id: params.id as string,
        $slug: slug,
        $title: title,
        $excerpt: excerpt,
        $content: content,
        $tags: tags,
        $published: published ? 1 : 0,
        $updatedAt: now,
      });
      return { success: true, post };
    },
    {
      requireAuth: true,
      body: t.Object({
        title: t.String(),
        excerpt: t.String(),
        content: t.String(),
        tags: t.String(),
        published: t.Boolean(),
      }),
    }
  )
  .delete(
    "/api/posts/:id",
    ({ params, user }) => {
      if (!user) {
        return { error: "Unauthorized" };
      }
      const existing = queries.getPostById.get(params.id as string);
      if (!existing) {
        return { error: "Post not found" };
      }
      queries.deletePost.run(params.id as string);
      return { success: true };
    },
    {
      requireAuth: true,
    }
  )
  .get("/api/comments/:postId", ({ params }) => {
    const comments = queries.getCommentsByPostId.all(params.postId as string);
    return { comments };
  })
  .post(
    "/api/comments",
    ({ body }) => {
      const { postId, author, content } = body as {
        postId: string;
        author: string;
        content: string;
      };
      const id = generateId();
      const now = new Date().toISOString();
      const comment = queries.createComment.get({
        $id: id,
        $postId: postId,
        $author: author,
        $content: content,
        $createdAt: now,
      });
      return { success: true, comment };
    },
    {
      body: t.Object({
        postId: t.String(),
        author: t.String(),
        content: t.String(),
      }),
    }
  );

export type Api = typeof api;
