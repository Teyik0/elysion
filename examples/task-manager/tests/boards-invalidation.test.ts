import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import {
  __resetCacheState,
  consumePendingInvalidations,
} from "../../../packages/core/src/render/cache";

let deleteBoardResult = true;
let nextBoardId = "board-created";

mock.module("../src/api/modules/boards/service", () => ({
  createBoard: (name: string) => ({
    id: nextBoardId,
    name,
    createdAt: "2026-05-01T00:00:00.000Z",
  }),
  deleteBoard: () => deleteBoardResult,
  getBoardData: () => undefined,
  getBoardStats: () => undefined,
  getBoards: () => [],
}));

describe("boards API cache invalidation", () => {
  beforeEach(() => {
    __resetCacheState();
    deleteBoardResult = true;
    nextBoardId = "board-created";
  });

  afterEach(() => {
    __resetCacheState();
  });

  test("creating a board invalidates both the index page and board layout sidebars", async () => {
    const { boardPlugin } = await import("../src/api/modules/boards");

    const response = await boardPlugin.handle(
      new Request("http://furin/boards", {
        body: JSON.stringify({ name: "New board" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      })
    );

    expect(response.status).toBe(200);
    expect(consumePendingInvalidations()).toEqual(["/", "/board:layout"]);
  });

  test("deleting a board invalidates both the index page and board layout sidebars", async () => {
    const { boardPlugin } = await import("../src/api/modules/boards");

    const response = await boardPlugin.handle(
      new Request("http://furin/boards/board-deleted", { method: "DELETE" })
    );

    expect(response.status).toBe(200);
    expect(consumePendingInvalidations()).toEqual(["/", "/board:layout"]);
  });
});
