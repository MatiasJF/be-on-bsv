import { vi } from "vitest";

/**
 * Lightweight mock of `@supabase/supabase-js`'s query builder.
 *
 * The real client uses a chainable builder that ends in `await` or
 * `.single()`/`.maybeSingle()`. We mimic that with a thenable Builder so any
 * combination of `.from().select().eq().is().order().range()` etc. resolves
 * to a configurable `{ data, error }` payload keyed by `<table>.<op>`.
 *
 * Use `setMockResult("events.select", { … })` in a test to control the
 * response. Reset between tests with `resetMockState()`.
 */

interface SupabaseResult<T = unknown> {
  data: T;
  error: { message: string; code?: string } | null;
}

const mockState = {
  results: new Map<string, SupabaseResult>(),
  ops: [] as string[],
};

export function setMockResult<T = unknown>(
  key: string,
  data: T,
  error: { message: string; code?: string } | null = null,
): void {
  mockState.results.set(key, { data, error });
}

export function resetMockState(): void {
  mockState.results.clear();
  mockState.ops = [];
}

export function recordedOps(): string[] {
  return [...mockState.ops];
}

class Builder {
  private op = "select";
  private opLocked = false;

  constructor(private readonly table: string) {}

  // `.select()` is the default; calling it after a write (insert/update/etc.)
  // is the supabase pattern for "return the affected row" and must NOT
  // overwrite the primary operation.
  select(): this {
    if (!this.opLocked) this.op = "select";
    return this;
  }
  insert(_data: unknown): this {
    this.op = "insert";
    this.opLocked = true;
    return this;
  }
  update(_data: unknown): this {
    this.op = "update";
    this.opLocked = true;
    return this;
  }
  delete(): this {
    this.op = "delete";
    this.opLocked = true;
    return this;
  }
  upsert(_data: unknown): this {
    this.op = "upsert";
    this.opLocked = true;
    return this;
  }
  // Chainable filters / modifiers — all no-ops, just return self.
  eq(): this {
    return this;
  }
  is(): this {
    return this;
  }
  gte(): this {
    return this;
  }
  lt(): this {
    return this;
  }
  contains(): this {
    return this;
  }
  range(): this {
    return this;
  }
  order(): this {
    return this;
  }
  limit(): this {
    return this;
  }

  private resolve(): SupabaseResult {
    const key = `${this.table}.${this.op}`;
    mockState.ops.push(key);
    return mockState.results.get(key) ?? { data: null, error: null };
  }

  maybeSingle(): Promise<SupabaseResult> {
    return Promise.resolve(this.resolve());
  }
  single(): Promise<SupabaseResult> {
    return Promise.resolve(this.resolve());
  }
  // Thenable so `await builder` works without `.single()`.
  then<TResult1 = SupabaseResult, TResult2 = never>(
    onFulfilled?: ((value: SupabaseResult) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.resolve()).then(onFulfilled, onRejected);
  }
}

export const supabase = {
  from(table: string) {
    return new Builder(table);
  },
  storage: {
    from() {
      return {
        upload: vi.fn().mockResolvedValue({ data: null, error: null }),
        getPublicUrl: vi
          .fn()
          .mockReturnValue({ data: { publicUrl: "https://stub.example/cover.jpg" } }),
      };
    },
  },
  auth: {
    /**
     * Mock of `supabase.auth.getUser(token)`. Configure per-test with
     *   setMockResult("auth.getUser", { user: { id, email, app_metadata: { role: "admin" } } });
     * The mock ignores the token argument — tests that need to differentiate
     * "valid admin", "valid non-admin", and "invalid" call setMockResult
     * with the appropriate user shape (or `null` + an error).
     */
    async getUser(_token?: string): Promise<SupabaseResult> {
      mockState.ops.push("auth.getUser");
      return (
        mockState.results.get("auth.getUser") ?? {
          data: { user: null },
          error: { message: "not configured" },
        }
      );
    },
  },
};
