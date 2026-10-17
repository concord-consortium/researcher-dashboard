import { describe, expect, it } from "vitest";
import { plainError } from "../src/shell/errors";

describe("plainError", () => {
  it("words each error the runner and the watchdog write, keeping the text only where it adds to the words", () => {
    expect(plainError("VM terminated during analysis")).toEqual({ plain: "The runner stopped before the run finished.", detail: null });
    expect(plainError("The machine running it stopped before the run finished; run it again."))
      .toEqual({ plain: "The runner stopped before the run finished.", detail: null });
    expect(plainError("No VM took this package before its VM's life ended; run it again"))
      .toEqual({ plain: "No runner picked up this run in time.", detail: null });
    expect(plainError("analysis exceeded 900000ms")).toEqual({ plain: "The run took too long and was stopped.", detail: null });
    expect(plainError("cc-data login exited 1: token rejected"))
      .toEqual({ plain: "The runner could not sign in to read the class's data.", detail: "cc-data login exited 1: token rejected" });
    expect(plainError("package wrote no readable display.json: Unexpected token"))
      .toEqual({ plain: "The package finished without writing a result.", detail: "package wrote no readable display.json: Unexpected token" });
  });

  it("reads any other error as the package failing, with the error as its detail, and no error as no reason", () => {
    expect(plainError("Traceback: KeyError 'x'")).toEqual({ plain: "The package stopped with an error.", detail: "Traceback: KeyError 'x'" });
    expect(plainError("my analysis exceeded 5ms")).toEqual({ plain: "The package stopped with an error.", detail: "my analysis exceeded 5ms" });
    expect(plainError(null)).toEqual({ plain: "The package gave no reason.", detail: null });
    expect(plainError("  ")).toEqual({ plain: "The package gave no reason.", detail: null });
  });
});
