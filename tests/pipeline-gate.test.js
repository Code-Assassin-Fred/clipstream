// tests/pipeline-gate.test.js — Negative test demonstrating CI/CD pipeline gate

/**
 * CI/CD Pipeline Gate Verification:
 *
 * This test file satisfies Coursework Specification Section 15:
 * "Add a negative test that proves a failing test blocks the pipeline
 * (the student will demonstrate this once in the video or slides)."
 *
 * To demonstrate:
 * 1. Set environment variable FAIL_TEST=true or uncomment the failing assertion below.
 * 2. Run `npm test` or push to GitHub.
 * 3. Observe the test suite fail with non-zero exit code, blocking the CI/CD pipeline.
 */

describe('CI/CD Pipeline Quality Gate', () => {
  test('pipeline gate passes under normal conditions', () => {
    expect(true).toBe(true);
  });

  if (process.env.FAIL_TEST === 'true') {
    test('deliberately failing test to prove pipeline blocks', () => {
      expect('pipeline-gate-check').toBe('DELIBERATE_FAILURE_TO_DEMO_BLOCK');
    });
  }
});

