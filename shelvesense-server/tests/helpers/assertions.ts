export function expectStructuredError(body: unknown): void {
  expect(body).toEqual(
    expect.objectContaining({
      error: expect.objectContaining({
        code: expect.any(String),
        message: expect.any(String),
      }),
    }),
  );
}
