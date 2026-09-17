// The researcher status doc's `state` field, and the only transitions that may
// produce it. Keeping this pure and separate from the hooks is what lets the tests
// assert the illegal ones are refused without standing up Firestore or S3.

export const STATES = Object.freeze({
  STARTING: "starting",
  READY: "ready",
  RUNNING: "running",
  SUSPENDING: "suspending",
  SUSPENDED: "suspended",
  TERMINATED: "terminated",
  FAILED: "failed"
});

const { STARTING, READY, RUNNING, SUSPENDING, SUSPENDED, TERMINATED, FAILED } = STATES;

// `null` is the VM before /run. TERMINATED is final: a VM that has run its
// terminate hook has no disk left to say anything else about.
const ALLOWED = Object.freeze({
  [null]: [STARTING],
  [STARTING]: [READY, FAILED],
  [READY]: [RUNNING, SUSPENDING, TERMINATED, FAILED],
  [RUNNING]: [READY, SUSPENDING, TERMINATED, FAILED],
  [SUSPENDING]: [SUSPENDED, FAILED],
  // A suspended VM resumes to READY. Lambda can also terminate it without a
  // resume, so TERMINATED is reachable from here too.
  [SUSPENDED]: [READY, TERMINATED, FAILED],
  // FAILED is not final: a failed sync leaves the VM running, and the next
  // successful analysis or resume puts it back in service.
  [FAILED]: [READY, SUSPENDING, TERMINATED],
  [TERMINATED]: []
});

export function canTransition(from, to) {
  return (ALLOWED[from] ?? []).includes(to);
}

export class VmState {
  #state = null;

  get state() {
    return this.#state;
  }

  get isTerminal() {
    return this.#state === TERMINATED;
  }

  // Throws rather than returning false: every caller is a hook that must fail
  // loudly rather than silently leave the doc describing the wrong thing.
  to(next) {
    if (!canTransition(this.#state, next)) {
      throw new Error(`illegal state transition ${this.#state} -> ${next}`);
    }
    this.#state = next;
    return next;
  }
}
