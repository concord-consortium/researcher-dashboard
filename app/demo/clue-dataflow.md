# CLUE Dataflow: trial and error vs. systematicity

```
episodes: 23 (6 systematic, 17 trial-and-error)
replay links: 23 of 23 episodes
  offering id from rtdb                  23
```

## Detection stages

### Log events (build_log_events.py)

```
log events: 266 rows, 5 documents, 2 users
```

### Population (build_population.py)

```
population: 8 documents, 0 clock-suspect, 8 usable
```

### Edits (build_edits.py)

```
edits: 2813 operations
  runtime            1216   43.2%
  structure           531   18.9%
  layout              303   10.8%
  other               303   10.8%
  parameter           142    5.0%
  tile                132    4.7%
  derived              73    2.6%
  ambiguous            67    2.4%
  documentation        45    1.6%
  undo                  1    0.0%
```

### Presence (build_presence.py)

```
presence: 175 intervals across 7 documents, 0 coarse-rate, median length 0.0s
```

### Slider trials (build_trials.py)

```
slider trials: 30 across 5 documents (67 moves, 10 with >=3 moves)
  median 2 moves, 8.8s; p90 duration 36.7s
  25 of 30 (83.3%) follow a program edit within 120s
by simulation:
  EMG_and_claw                6 docs,   5 with trials,    30 trials
  (no simulator tile)         2 docs,   0 with trials,     0 trials
```

### Sensor trials (build_sensor_trials.py)

```
physical-sensor population:
  documents in the analysis population           8
    ...containing a Sensor node                  7
    ...with that Sensor bound to a device        1
    ...and carrying tickAndProcess history       1
    ...yielding at least one detected trial      0
sensor trials: 3
  simulated     3 trials,   1 documents,   1 nodes; median 2.5s, p90 4.5s
            2 (66.7%) follow an edit within 120s; 0 (0.0%) overlap an edit
```

### Cycles (build_cycles.py)

```
cycles: 111 (burst gap 25.0s)
  present_unknown          47   42.3%
  absent                   39   35.1%
  unknown                  14   12.6%
  long                     10    9.0%
  watching                  1    0.9%
composition: 33.3% single-target, 30.6% 3+ targets, 41.4% oscillating, 24.3% followed by a trial
```

## Episodes

| episode_id | doc_id | owner | unit | problem | tile_id | kind | n_cycles | purity | span_s | started | ended | first_entry_id | last_entry_id | first_entry_idx | last_entry_idx | n_entries | outputs | ticks_available | n_ticks_cover | stratum | offering_source |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ep-01 | doc-01 | Student 1002 | brain | 5 | tile-01 | trial_and_error | 2 | 1.0 | 49.661 | 2024-02-16 14:08:58.105 | 2024-02-16 14:09:47.766 | entry-01 | entry-02 | 17 | 30 | 81 | Live Output Physical Gripper | false | 0 | boundary | rtdb |
| ep-02 | doc-01 | Student 1002 | brain | 5 | tile-01 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-16 14:19:28.266 | 2024-02-16 14:19:28.266 | entry-03 | entry-04 | 51 | 55 | 81 | Demo Output Grabber | false | 0 | control | rtdb |
| ep-03 | doc-02 | Student 1001 | brain | 5 | tile-02 | trial_and_error | 13 | 0.8461538461538461 | 1230.104 | 2024-02-23 16:04:42.916 | 2024-02-23 16:25:13.02 | entry-05 | entry-06 | 694 | 1352 | 2475 | Live Output Physical Gripper | true | 0 | strong | rtdb |
| ep-04 | doc-02 | Student 1001 | brain | 5 | tile-03 | trial_and_error | 3 | 1.0 | 353.454 | 2024-02-18 00:10:42.744 | 2024-02-18 00:16:36.198 | entry-07 | entry-08 | 2 | 32 | 2475 | Demo Output Grabber, Live Output ⚠️ connect device | true | 0 | boundary | rtdb |
| ep-05 | doc-02 | Student 1001 | brain | 5 | tile-03 | trial_and_error | 14 | 0.8571428571428571 | 1310.213 | 2024-02-18 00:27:50.71 | 2024-02-18 00:49:40.923 | entry-09 | entry-10 | 66 | 415 | 2475 | Live Output Physical Gripper | true | 0 | strong | rtdb |
| ep-06 | doc-02 | Student 1001 | brain | 5 | tile-03 | trial_and_error | 4 | 0.75 | 486611.617 | 2024-02-18 00:53:48.75 | 2024-02-23 16:04:00.367 | entry-11 | entry-12 | 426 | 538 | 2475 | Live Output ⚠️ connect device | true | 0 | strong | rtdb |
| ep-07 | doc-03 | Student 1001 | brain | 3 | tile-04 | trial_and_error | 2 | 1.0 | 191.151 | 2024-02-26 14:43:30.985 | 2024-02-26 14:46:42.136 | entry-13 | entry-14 | 2 | 428 | 8400 |  | true | 1 | boundary | rtdb |
| ep-08 | doc-03 | Student 1001 | brain | 3 | tile-04 | systematic | 1 | 1.0 | 0.0 | 2024-02-26 14:50:33.185 | 2024-02-26 14:50:33.185 | entry-15 | entry-16 | 1302 | 1351 | 8400 | Live Output Physical Gripper | true | 1 | control | rtdb |
| ep-09 | doc-03 | Student 1001 | brain | 3 | tile-04 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-26 14:51:16.692 | 2024-02-26 14:51:16.692 | entry-17 | entry-18 | 1432 | 1504 | 8400 | Live Output Physical Gripper | true | 1 | control | rtdb |
| ep-10 | doc-03 | Student 1001 | brain | 3 | tile-04 | trial_and_error | 3 | 1.0 | 189307.52 | 2024-02-26 14:53:46.42 | 2024-02-28 19:28:53.94 | entry-19 | entry-20 | 1806 | 4192 | 8400 | Live Output Simulated Gripper | true | 2 | boundary | rtdb |
| ep-11 | doc-03 | Student 1001 | brain | 3 | tile-04 | systematic | 1 | 1.0 | 0.0 | 2024-02-28 19:30:23.425 | 2024-02-28 19:30:23.425 | entry-21 | entry-22 | 4236 | 4253 | 8400 | Live Output Simulated Gripper | true | 1 | control | rtdb |
| ep-12 | doc-03 | Student 1001 | brain | 3 | tile-04 | trial_and_error | 2 | 1.0 | 155.865 | 2024-02-28 19:30:55.334 | 2024-02-28 19:33:31.199 | entry-23 | entry-24 | 4330 | 4943 | 8400 | Live Output Simulated Gripper | true | 1 | boundary | rtdb |
| ep-13 | doc-03 | Student 1001 | brain | 3 | tile-05 | trial_and_error | 2 | 1.0 | 2846.067 | 2024-02-29 14:43:54.095 | 2024-02-29 15:31:20.162 | entry-25 | entry-26 | 7364 | 8102 | 8400 |  | true | 0 | boundary | rtdb |
| ep-14 | doc-04 | Student 1001 | brain | 2 | tile-06 | trial_and_error | 2 | 1.0 | 165.791 | 2024-02-26 13:34:11.004 | 2024-02-26 13:36:56.795 | entry-27 | entry-28 | 2589 | 3424 | 14686 | Demo Output Light Bulb, Live Output Simulated Gripper | true | 2 | boundary | rtdb |
| ep-15 | doc-04 | Student 1001 | brain | 2 | tile-06 | systematic | 1 | 1.0 | 0.0 | 2024-02-26 13:39:31.488 | 2024-02-26 13:39:31.488 | entry-29 | entry-29 | 3513 | 3513 | 14686 | Live Output Simulated Gripper | true | 1 | control | rtdb |
| ep-16 | doc-04 | Student 1001 | brain | 2 | tile-06 | trial_and_error | 2 | 1.0 | 118.904 | 2024-02-26 13:45:57.917 | 2024-02-26 13:47:56.821 | entry-30 | entry-31 | 5213 | 6126 | 14686 | Live Output Simulated Gripper | true | 2 | boundary | rtdb |
| ep-17 | doc-04 | Student 1001 | brain | 2 | tile-07 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-27 13:32:30.177 | 2024-02-27 13:32:30.177 | entry-32 | entry-33 | 13252 | 13427 | 14686 |  | true | 0 | control | rtdb |
| ep-18 | doc-05 | Student 1002 | brain | 3 | tile-08 | trial_and_error | 3 | 1.0 | 240.862 | 2024-02-27 15:45:07.169 | 2024-02-27 15:49:08.031 | entry-34 | entry-35 | 34 | 153 | 2528 | Demo Output Grabber | true | 0 | boundary | rtdb |
| ep-19 | doc-05 | Student 1002 | brain | 3 | tile-08 | trial_and_error | 2 | 1.0 | 152.492 | 2024-02-27 15:56:41.301 | 2024-02-27 15:59:13.793 | entry-36 | entry-37 | 341 | 674 | 2528 | Live Output Simulated Gripper | true | 2 | boundary | rtdb |
| ep-20 | doc-05 | Student 1002 | brain | 3 | tile-08 | trial_and_error | 3 | 1.0 | 214.104 | 2024-02-27 16:06:14.595 | 2024-02-27 16:09:48.699 | entry-38 | entry-39 | 1265 | 1536 | 2528 | Live Output Simulated Gripper | true | 3 | boundary | rtdb |
| ep-21 | doc-05 | Student 1002 | brain | 3 | tile-08 | systematic | 1 | 1.0 | 0.0 | 2024-02-27 16:25:29.5 | 2024-02-27 16:25:29.5 | entry-40 | entry-40 | 2359 | 2359 | 2528 | Live Output Simulated Gripper | true | 0 | control | rtdb |
| ep-22 | doc-06 | Student 1004 | brain | 3 | tile-09 | systematic | 1 | 1.0 | 0.0 | 2025-04-30 21:36:54.052 | 2025-04-30 21:36:54.052 | entry-41 | entry-42 | 1885 | 1954 | 5653 |  | true | 0 | control | rtdb |
| ep-23 | doc-06 | Student 1004 | brain | 3 | tile-10 | systematic | 1 | 1.0 | 0.0 | 2025-04-30 21:38:23.757 | 2025-04-30 21:38:23.757 | entry-43 | entry-44 | 2764 | 2886 | 5653 |  | true | 1 | control | rtdb |

## Sampled episodes

The fenced block under each episode says in words what the student did in each cycle -- easier to read than the replay, where tick output is interleaved with the edits. It is often enough on its own.

Each cycle is two phases. **Program Changes** is the burst of edits and how long it took. **Outside Program** is the gap from that burst's last edit to the next burst's first, and everything that happened inside it. The two sum to the duration in the cycle's header, which also carries the wall-clock time and the history index of the burst's first entry -- so you can open the replay at a cycle rather than at the episode.

`tested` means the student drove the program's input. `switched to` means they clicked one of the Simulator tile's own controls. `sim:` is what moved in the simulation while they watched: `no change` means it ran and nothing happened, `not running` means it was not running, which is no evidence either way.

`sim:` says something moved, not who moved it. The student may have driven it by moving the slider, or indirectly -- that move running through their program to close the gripper and raise the pressure. Or a generator, a timer or a feedback loop moved it with the student sitting still. A `tested` line in the same cycle is what says they were driving the input at the time.

A `[...]` marker means the variable moves on its own. The gripper simulation's pan boils on a loop, and Temperature reports it whenever the gripper is closed far enough -- so a gripper held closed shows a changing temperature with nobody driving it. The terrarium's humidity falls 1%/min whatever is running. Do not read a marked change as the program having done something. The terrarium's Temperature is unmarked and moves only for the fan or the heat lamp, so it is honest evidence.

**start** and **end** are the two ends of the episode: when it happened, where the entry sits in the document's history, and a link that opens the document there. They are separate fields because CLUE cannot yet show a range on the slider (CLUE-635), so opening both is how you see where the episode begins and ends.

**ticks** is how much of the episode the program's tick stream covers. It matters twice: ticks are the only presence channel for a document with no log session, so their absence weakens every pause classification in the episode; and they are the only place a node's output value is recorded, so without them there is no way to tell whether the program was driving anything. Both are properties of when the document was written -- `tickAndProcess` does not appear in the corpus before 2024 -- not of the student.

**outputs** is what the program could drive during the episode, and so what the student could have been watching. `Live Output` drives a device and names its binding; `⚠️ connect device` is CLUE's own words for a node that wants one with none attached -- that program produced no visible effect anywhere, which is a strong reason for a pause to be idle. `Demo Output` never touches hardware but animates on screen, which is more watchable than a number changing, so it counts too. A node the student built and later deleted is still listed: it was there to watch at the time.

`entry 412 of 5,003` is CLUE's own index for that entry and the number of entries the document holds -- how far into the student's work this episode sits, and how much of it the episode covers.

Strata: **strong** = a long run, **boundary** = a short run near the threshold, **control** = a single cycle. Boundary and control episodes matter most -- they are where the thresholds are wrong.

`date` is when the episode started, on the student's own device clock -- history entries carry no server timestamp.

## What these episodes are

An episode is a run of consecutive edit-and-pause cycles on one tile in one document, all carrying the same label. A cycle is a burst of edits plus the pause that follows it.

**systematic** -- each cycle changed exactly one thing, and there is evidence the student then checked it: they moved the simulation's slider, or the pause after the edit shows them present and watching, or they wrote something down.

**trial_and_error** -- a cycle changed three or more distinct things before any check, or it undid something, or it oscillated: a value put in and taken back out within the same burst. Oscillation is the most common route to this label, so it is the one most worth checking.

Cycles matching neither rule are unclassified, which is most of them. An episode tolerates one unclassified cycle in the middle without breaking; `purity` in candidates.parquet records what fraction of the cycles actually carried the label.

## What to look for

The label is inferred from the shape of the edits. You are judging whether someone watching the student would agree.

For a **systematic** episode, check that the student really changed one thing at a time and really checked between changes. Reject it if the pause was the student leaving or idling rather than attending to the program, or if they changed several things and only one was visible to the detector.

One asymmetry to allow for: the strongest evidence of checking is the student driving the simulation's input, and the terrarium simulation has no control to drive -- it is a closed loop fed by the student's own outputs. Those episodes can only ever be evidenced by pausing or writing something down, so a thinner case there is a limit of the data rather than a weaker student.

For a **trial_and_error** episode, check that the student changed several things before observing any result. Reject it if a repeated change was a deliberate comparison rather than flailing, or if the edits were housekeeping -- renaming, moving or resizing tiles -- rather than trying things out.

Built at a burst gap of 25.0s, calibrated against trial-bounded cycles (see `build_cycles.py`). Composition rates still move with that number, and it is calibrated on the documents that have detectable trials rather than the whole corpus, so treat the rates as approximate and compare students against each other.

## systematic — control (6 shown)

### ep-08

- **date:** 2024-02-26
- **unit/problem:** brain 3
- **document:** `doc-03`
- **outputs:** Live Output Physical Gripper
- **ticks:** 1 of 1 pauses covered
- **cycles:** 1
- **changes:** 1 node, 2 param (Sensor)
- **start:** 2024-02-26 14:50:33 · entry 1302 of 8400 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-03&studentDocumentHistoryId=entry-15)
- **end:** 2024-02-26 14:50:33 · entry 1351 of 8400 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-03&studentDocumentHistoryId=entry-16)

```
1. 2024-02-26 14:50:33, history start 1302, duration 44s
  Program Changes (15s)
    added a Sensor node
    set Sensor.type = fsr-reading
    set Sensor.sensor = fsr
  Outside Program (28s, present unknown)
    sim: no change
```

### ep-11

- **date:** 2024-02-28
- **unit/problem:** brain 3
- **document:** `doc-03`
- **outputs:** Live Output Simulated Gripper
- **ticks:** 1 of 1 pauses covered
- **cycles:** 1
- **changes:** 2 conn (Control)
- **start:** 2024-02-28 19:30:23 · entry 4236 of 8400 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-03&studentDocumentHistoryId=entry-21)
- **end:** 2024-02-28 19:30:23 · entry 4253 of 8400 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-03&studentDocumentHistoryId=entry-22)

```
1. 2024-02-28 19:30:23, history start 4236, duration 32s
  Program Changes (4s)
    connected Transform -> Control (num2)
    connected Logic -> Control (num1)
  Outside Program (28s, present unknown)
    sim: no change
```

### ep-15

- **date:** 2024-02-26
- **unit/problem:** brain 2
- **document:** `doc-04`
- **outputs:** Live Output Simulated Gripper
- **ticks:** 1 of 1 pauses covered
- **cycles:** 1
- **changes:** 1 param (Control)
- **start:** 2024-02-26 13:39:31 · entry 3513 of 14686 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-04&studentDocumentHistoryId=entry-29)
- **end:** 2024-02-26 13:39:31 · entry 3513 of 14686 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-04&studentDocumentHistoryId=entry-29)

```
1. 2024-02-26 13:39:31, history start 3513, duration 28s
  Program Changes (0s)
    set Control.controlOperator = Hold Prior
  Outside Program (28s, present unknown)
    tested Target EMG x2
    sim: no change (Gripper 0, Surface Pressure 0)
```

### ep-21

- **date:** 2024-02-27
- **unit/problem:** brain 3
- **document:** `doc-05`
- **outputs:** Live Output Simulated Gripper
- **ticks:** none during this episode (the document has some)
- **cycles:** 1
- **changes:** 1 param (Control)
- **start:** 2024-02-27 16:25:29 · entry 2359 of 2528 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-05&studentDocumentHistoryId=entry-40)
- **end:** 2024-02-27 16:25:29 · entry 2359 of 2528 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-05&studentDocumentHistoryId=entry-40)

```
1. 2024-02-27 16:25:29, history start 2359, then no further edits
  Program Changes (0s)
    set Control.controlOperator = Hold Current
  Outside Program (no further edits, showing 120s)
    tested Target EMG x2
    sim: Gripper 9..100 x46, Surface Pressure 0..300 x13
```

### ep-22

- **date:** 2025-04-30
- **unit/problem:** brain 3
- **document:** `doc-06`
- **outputs:** none
- **ticks:** none during this episode (the document has some)
- **cycles:** 1
- **changes:** 1 node, 1 param (Transform)
- **start:** 2025-04-30 21:36:54 · entry 1885 of 5653 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-06&studentDocumentHistoryId=entry-41)
- **end:** 2025-04-30 21:36:54 · entry 1954 of 5653 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-06&studentDocumentHistoryId=entry-42)

```
1. 2025-04-30 21:36:54, history start 1885, then no further edits
  Program Changes (5s)
    added a Transform node
    set Transform.transformOperator = Ramp
  Outside Program (no further edits, showing 120s)
    tested emg-reading (simulated) x18, Target EMG x4
    sim: Gripper 0..100 x380, Surface Pressure 0..300 x12
```

### ep-23

- **date:** 2025-04-30
- **unit/problem:** brain 3
- **document:** `doc-06`
- **outputs:** none
- **ticks:** 1 of 1 pauses covered
- **cycles:** 1
- **changes:** 1 node, 1 param (Transform)
- **start:** 2025-04-30 21:38:23 · entry 2764 of 5653 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-06&studentDocumentHistoryId=entry-43)
- **end:** 2025-04-30 21:38:23 · entry 2886 of 5653 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-06&studentDocumentHistoryId=entry-44)

```
1. 2025-04-30 21:38:23, history start 2764, duration 78s
  Program Changes (15s)
    added a Transform node
    set Transform.transformOperator = Ramp
  Outside Program (64s, present unknown)
    tested emg-reading (simulated) x18, Target EMG x4
    sim: Gripper 9..100 x78, Surface Pressure 0..300 x18
```

## trial_and_error — strong (3 shown)

### ep-03

- **date:** 2024-02-23
- **unit/problem:** brain 5
- **document:** `doc-02`
- **outputs:** Live Output Physical Gripper
- **ticks:** none during this episode (the document has some)
- **cycles:** 13
- **changes:** 32 node, 42 conn, 25 param
- **start:** 2024-02-23 16:04:42 · entry 694 of 2475 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-02&studentDocumentHistoryId=entry-05)
- **end:** 2024-02-23 16:25:13 · entry 1352 of 2475 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-02&studentDocumentHistoryId=entry-06)

```
1. 2024-02-23 16:04:42, history start 694, duration 2m 29s
  Program Changes (45s, 5 targets)
    added a Sensor node
    added a Sensor node
    added a Logic node
    added a Logic node
    set Logic.logicOperator = Less Than
    set Logic.logicOperator = Greater Than Or Equal To
    set Logic.logicOperator = Greater Than Or Equal To
    added a Number node
    connected Number -> Logic (num2)
    connected Sensor -> Logic (num1)
  Outside Program (104s, absent)
    sim: not running
2. 2024-02-23 16:07:12, history start 722, duration 75s
  Program Changes (43s, 3 targets)
    set Sensor.type = emg-reading
    set Sensor.sensor = emg
    set Sensor.type = emg-reading
    set Sensor.sensor = emg
    added a Number node
  Outside Program (32s, absent)
    sim: not running
3. 2024-02-23 16:08:26, history start 772, duration 91s
  Program Changes (29s, 3 targets)
    connected Sensor -> Logic (num1)
    connected Number -> Logic (num2)
    set Logic.logicOperator = Less Than Or Equal To
    added a Control node
    set Control.controlOperator = Output Zero
    added a Number node
  Outside Program (62s, absent)
    sim: not running
4. 2024-02-23 16:09:57, history start 788, duration 3m 9s
  Program Changes (2m 38s, 7 targets)
    added a Live Output node
    set Live Output.hubSelect = Physical Gripper
    added a Sensor node
    added a Logic node
    added a Number node
    set Sensor.type = emg-reading
    set Sensor.sensor = emg
    connected Sensor -> Logic (num1)
    connected Logic -> Live Output (nodeValue)
    disconnected the nodeValue input of Live Output
    added a Number node
    connected Number -> Live Output (nodeValue)
    connected Number -> Control (num1)
    connected Logic -> Control (num2)
    set Control.controlOperator = Hold Current
    disconnected the num1 input of Control
    disconnected the num2 input of Control
    added a Logic node
    set Logic.logicOperator = And
    connected Logic -> Logic (num2)
    connected Logic -> Logic (num1)
    connected Logic -> Control (num2)
    connected Number -> Control (num1)
    set Control.controlOperator = Hold Prior
  Outside Program (30s, absent)
    sim: not running
5. 2024-02-23 16:13:06, history start 915, duration 98s
  Program Changes (51s, 3 targets)
    set Control.controlOperator = Hold Current
    added a Transform node
    set Transform.transformOperator = Round
    deleted the Transform node
    set Control.controlOperator = Output Zero
    disconnected the nodeValue input of Live Output
    connected Control -> Live Output (nodeValue)
  Outside Program (47s, absent)
    sim: not running
6. 2024-02-23 16:14:44, history start 946, duration 2m 22s
  Program Changes (42s, 5 targets)
    set Control.controlOperator = Hold Current
    disconnected the num2 input of Control
    connected Number -> Control (num2)
    connected Logic -> Control (num1)
    disconnected the num1 input of Logic
    deleted the Sensor node
    deleted the Number node
    deleted the Logic node
    deleted the Number node
  Outside Program (101s, absent)
    sim: not running
7. 2024-02-23 16:17:06, history start 995, duration 57s
  Program Changes (21s, 2 targets)
    disconnected the num1 input of Control
    added a Transform node
    set Transform.transformOperator = Not
    connected Logic -> Transform (num1)
    connected Transform -> Control (num1)
  Outside Program (35s, absent)
    sim: not running
8. 2024-02-23 16:18:03, history start 1019, duration 53s
  Program Changes (11s)
    disconnected the num1 input of Control
    connected Transform -> Control (num1)
    set Control.controlOperator = Output Zero
  Outside Program (42s, absent)
    sim: not running
9. 2024-02-23 16:18:56, history start 1031, duration 116s
  Program Changes (59s, 7 targets)
    added a Number node
    added a Sensor node
    added a Sensor node
    added a Number node
    connected Number -> Logic (num2)
    disconnected the num2 input of Logic
    disconnected the num2 input of Logic
    disconnected the num1 input of Logic
    deleted the Sensor node
    deleted the Sensor node
    deleted the Sensor node
  Outside Program (57s, absent)
    sim: not running
10. 2024-02-23 16:20:52, history start 1123, duration 73s
  Program Changes (15s, 2 targets)
    connected Sensor -> Logic (num1)
    connected Number -> Logic (num2)
  Outside Program (58s, absent)
    sim: not running
11. 2024-02-23 16:22:06, history start 1170, duration 110s
  Program Changes (71s, 3 targets)
    disconnected the nodeValue input of Live Output
    disconnected the num2 input of Control
    connected Number -> Live Output (nodeValue)
    disconnected the nodeValue input of Live Output
    connected Number -> Control (num2)
    connected Control -> Live Output (nodeValue)
    disconnected the num1 input of Control
    deleted the Transform node
    connected Logic -> Control (num1)
    set Control.controlOperator = Hold Current
  Outside Program (39s, absent)
    sim: not running
12. 2024-02-23 16:23:55, history start 1289, duration 77s
  Program Changes (6s)
    set Control.controlOperator = Hold Prior
    set Control.controlOperator = Output Zero
  Outside Program (72s, absent)
    sim: not running
13. 2024-02-23 16:25:13, history start 1302, duration 95s
  Program Changes (47s, 4 targets)
    added a Sensor node
    deleted the Number node
    disconnected the nodeValue input of Live Output
    deleted the Number node
    set Sensor.type = fsr-reading
  Outside Program (48s, absent)
    sim: not running
```

### ep-05

- **date:** 2024-02-18
- **unit/problem:** brain 5
- **document:** `doc-02`
- **outputs:** Live Output Physical Gripper
- **ticks:** none during this episode (the document has some)
- **cycles:** 14
- **changes:** 30 node, 47 conn, 19 param
- **start:** 2024-02-18 00:27:50 · entry 66 of 2475 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-02&studentDocumentHistoryId=entry-09)
- **end:** 2024-02-18 00:49:40 · entry 415 of 2475 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-02&studentDocumentHistoryId=entry-10)

```
1. 2024-02-18 00:27:50, history start 66, duration 94s
  Program Changes (67s, 4 targets)
    set Live Output.plot = true
    set Live Output.plot = false
    added a Live Output node
    set Live Output.hubSelect = Physical Gripper
    added a Live Output node
    set Live Output.hubSelect = Physical Gripper
    deleted the Live Output node
    deleted the Live Output node
    added a Control node
  Outside Program (27s, absent)
    sim: not running
2. 2024-02-18 00:29:24, history start 101, duration 2m 31s
  Program Changes (86s, 4 targets)
    deleted the Control node
    disconnected the nodeValue input of Live Output
    connected Logic -> Live Output (nodeValue)
    disconnected the nodeValue input of Live Output
    disconnected the nodeValue input of Live Output
    deleted the Logic node
    added a Math node
    set Math.mathOperator = Divide
    connected Sensor -> Math (num1)
    disconnected the num1 input of Math
    connected Sensor -> Math (num1)
    connected Number -> Math (num2)
    connected Math -> Live Output (nodeValue)
  Outside Program (66s, absent)
    sim: not running
3. 2024-02-18 00:31:55, history start 136, duration 74s
  Program Changes (24s, 2 targets)
    added a Transform node
    set Transform.transformOperator = Ramp
    connected Math -> Transform (num1)
    disconnected the nodeValue input of Live Output
    connected Transform -> Live Output (nodeValue)
  Outside Program (49s, absent)
    sim: not running
4. 2024-02-18 00:33:09, history start 153, duration 92s
  Program Changes (67s, 3 targets)
    set Transform.plot = true
    set Transform.transformOperator = Round
    set Transform.transformOperator = Floor
    set Transform.transformOperator = Ramp
    disconnected the nodeValue input of Live Output
    deleted the Transform node
    connected Math -> Live Output (nodeValue)
    added a Control node
    set Control.controlOperator = Output Zero
    connected Math -> Control (num2)
  Outside Program (26s, absent)
    sim: not running
5. 2024-02-18 00:34:41, history start 183, duration 2m 1s
  Program Changes (62s, 4 targets)
    added a Sensor node
    set Sensor.type = fsr-reading
    deleted the Control node
    set Sensor.sensor = fsr
    added a Control node
    added a Logic node
  Outside Program (59s, absent)
    sim: not running
6. 2024-02-18 00:36:42, history start 259, duration 78s
  Program Changes (14s, 2 targets)
    connected Sensor -> Logic (num1)
    added a Number node
    connected Number -> Logic (num2)
  Outside Program (64s, absent)
    sim: not running
7. 2024-02-18 00:38:01, history start 271, duration 3m 25s
  Program Changes (2m 26s, 5 targets)
    connected Logic -> Control (num1)
    disconnected the nodeValue input of Live Output
    connected Math -> Control (num2)
    connected Control -> Live Output (nodeValue)
    disconnected the nodeValue input of Live Output
    connected Math -> Live Output (nodeValue)
    added a Logic node
    connected Math -> Logic (num1)
    set Logic.logicOperator = Less Than
    added a Number node
    connected Number -> Logic (num2)
    disconnected the nodeValue input of Live Output
    added a Control node
    deleted the Control node
  Outside Program (59s, absent)
    sim: not running
8. 2024-02-18 00:41:26, history start 315, duration 108s
  Program Changes (45s, 3 targets)
    added a Logic node
    set Logic.logicOperator = And
    set Logic.logicOperator = Greater Than
    connected Logic -> Logic (num1)
    connected Logic -> Logic (num2)
    disconnected the num1 input of Control
    disconnected the num2 input of Control
  Outside Program (63s, absent)
    sim: not running
9. 2024-02-18 00:43:14, history start 340, duration 36s
  Program Changes (9s, 2 targets)
    connected Logic -> Control (num2)
    connected Control -> Live Output (nodeValue)
  Outside Program (27s, absent)
    sim: not running
10. 2024-02-18 00:43:50, history start 349, duration 56s
  Program Changes (6s, 2 targets)
    disconnected the nodeValue input of Live Output
    deleted the Control node
    connected Logic -> Live Output (nodeValue)
  Outside Program (50s, absent)
    sim: not running
11. 2024-02-18 00:44:46, history start 357, duration 2m 3s
  Program Changes (93s, 7 targets)
    disconnected the nodeValue input of Live Output
    deleted the Logic node
    deleted the Logic node
    deleted the Number node
    added a Logic node
    connected Math -> Logic (num1)
    set Logic.logicOperator = And
    added a Logic node
    deleted the Logic node
    set Logic.logicOperator = Less Than
    connected Logic -> Logic (num2)
    connected Logic -> Live Output (nodeValue)
  Outside Program (30s, absent)
    sim: not running
12. 2024-02-18 00:46:49, history start 386, duration 106s
  Program Changes (35s, 2 targets)
    disconnected the num1 input of Logic
    added a Transform node
    set Transform.transformOperator = Round
    connected Math -> Transform (num1)
    connected Transform -> Logic (num1)
  Outside Program (71s, absent)
    sim: not running
13. 2024-02-18 00:48:35, history start 400, duration 65s
  Program Changes (16s, 2 targets)
    disconnected the nodeValue input of Live Output
    added a Control node
    connected Logic -> Control (num2)
    connected Control -> Live Output (nodeValue)
  Outside Program (49s, absent)
    sim: not running
14. 2024-02-18 00:49:40, history start 410, duration 48s
  Program Changes (14s)
    disconnected the num2 input of Control
    connected Math -> Control (num2)
    connected Logic -> Control (num1)
  Outside Program (34s, absent)
    sim: not running
```

### ep-06

- **date:** 2024-02-18
- **unit/problem:** brain 5
- **document:** `doc-02`
- **outputs:** Live Output ⚠️ connect device
- **ticks:** none during this episode (the document has some)
- **cycles:** 4
- **changes:** 14 node, 6 conn, 5 param
- **start:** 2024-02-18 00:53:48 · entry 426 of 2475 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-02&studentDocumentHistoryId=entry-11)
- **end:** 2024-02-23 16:04:00 · entry 538 of 2475 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-02&studentDocumentHistoryId=entry-12)

```
1. 2024-02-18 00:53:48, history start 426, duration 33s
  Program Changes (6s, 3 targets)
    set Live Output.hubSelect = ⚠️ connect device
    disconnected the num1 input of Logic
    deleted the Transform node
    deleted the Logic node
  Outside Program (27s, absent)
    sim: not running
2. 2024-02-18 00:54:21, history start 437, duration 103s
  Program Changes (0s)
    added a Logic node
  Outside Program (103s, absent)
    sim: not running
3. 2024-02-18 00:56:03, history start 445, duration 135h 7m
  Program Changes (2m 2s, 5 targets)
    added a Control node
    set Control.plot = true
    set Control.plot = false
    connected Math -> Control (num2)
    disconnected the num2 input of Control
    deleted the Math node
    added a Logic node
    connected Sensor -> Logic (num1)
    deleted the Logic node
    added a Logic node
    added a Math node
    deleted the Logic node
    connected Number -> Math (num2)
    connected Sensor -> Math (num1)
    set Math.mathOperator = Divide
    added a Transform node
    deleted the Transform node
  Outside Program (135h 5m, long)
    sim: not running
4. 2024-02-23 16:04:00, history start 535, duration 3m 20s
  Program Changes (2s, 2 targets)
    set Live Output.hubSelect = ⚠️ connect device
    added a Control node
    deleted the Control node
  Outside Program (3m 18s, absent)
    sim: not running
```

## trial_and_error — boundary (11 shown)

### ep-01

- **date:** 2024-02-16
- **unit/problem:** brain 5
- **document:** `doc-01`
- **outputs:** Live Output Physical Gripper
- **ticks:** none -- this document has no tick data at all
- **cycles:** 2
- **changes:** 5 node, 5 conn, 1 param
- **start:** 2024-02-16 14:08:58 · entry 17 of 81 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-01&studentDocumentHistoryId=entry-01)
- **end:** 2024-02-16 14:09:47 · entry 30 of 81 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-01&studentDocumentHistoryId=entry-02)

```
1. 2024-02-16 14:08:58, history start 17, duration 50s
  Program Changes (11s, 3 targets)
    added a Generator node
    disconnected the nodeValue input of Live Output
    deleted the Timer node
    connected Generator -> Live Output (nodeValue)
  Outside Program (39s, present unknown)
    sim: not running
2. 2024-02-16 14:09:47, history start 23, duration 5m 6s
  Program Changes (21s, 3 targets)
    added a Sensor node
    disconnected the nodeValue input of Live Output
    deleted the Generator node
    connected Sensor -> Live Output (nodeValue)
    set Sensor.type = temperature
    disconnected the nodeValue input of Live Output
    deleted the Sensor node
  Outside Program (4m 45s, present unknown)
    sim: not running
```

### ep-04

- **date:** 2024-02-18
- **unit/problem:** brain 5
- **document:** `doc-02`
- **outputs:** Demo Output Grabber, Live Output ⚠️ connect device
- **ticks:** none during this episode (the document has some)
- **cycles:** 3
- **changes:** 6 node, 13 conn, 6 param
- **start:** 2024-02-18 00:10:42 · entry 2 of 2475 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-02&studentDocumentHistoryId=entry-07)
- **end:** 2024-02-18 00:16:36 · entry 32 of 2475 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-02&studentDocumentHistoryId=entry-08)

```
1. 2024-02-18 00:10:42, history start 2, duration 105s
  Program Changes (26s, 2 targets)
    added a Timer node
    added a Live Output node
    set Live Output.hubSelect = Physical Gripper
    connected Timer -> Live Output (nodeValue)
    disconnected the nodeValue input of Live Output
  Outside Program (80s, absent)
    sim: not running
2. 2024-02-18 00:12:28, history start 10, duration 4m 8s
  Program Changes (33s, 2 targets)
    connected Timer -> Live Output (nodeValue)
    disconnected the nodeValue input of Live Output
    connected Timer -> Live Output (nodeValue)
    added a Demo Output node
    set Demo Output.outputType = Grabber
    connected ? -> Demo Output (?)
    disconnected the ? input of Demo Output
    connected ? -> Demo Output (?)
    disconnected the ? input of Demo Output
    connected ? -> Demo Output (?)
    deleted the Demo Output node
  Outside Program (3m 35s, absent)
    sim: not running
3. 2024-02-18 00:16:36, history start 23, duration 79s
  Program Changes (53s, 3 targets)
    set Live Output.hubSelect = ⚠️ connect device
    disconnected the nodeValue input of Live Output
    deleted the Timer node
    added a Sensor node
    set Sensor.type = emg-reading
    set Sensor.sensor = emg
    connected Sensor -> Live Output (nodeValue)
    set Live Output.hubSelect = Physical Gripper
    disconnected the nodeValue input of Live Output
  Outside Program (26s, absent)
    sim: not running
```

### ep-07

- **date:** 2024-02-26
- **unit/problem:** brain 3
- **document:** `doc-03`
- **outputs:** none
- **ticks:** 1 of 2 pauses covered
- **cycles:** 2
- **changes:** 9 node, 71 conn, 8 param
- **start:** 2024-02-26 14:43:30 · entry 2 of 8400 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-03&studentDocumentHistoryId=entry-13)
- **end:** 2024-02-26 14:46:42 · entry 428 of 8400 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-03&studentDocumentHistoryId=entry-14)

```
1. 2024-02-26 14:43:30, history start 2, duration 3m 11s
  Program Changes (81s, 2 targets)
    connected ? -> ? (num2)
    disconnected the ? input of ?
    connected ? -> ? (?)
    connected ? -> ? (num1)
    disconnected the ? input of ?
    connected ? -> ? (?)
    disconnected the num1 input of ?
    connected ? -> ? (num1)
    connected ? -> ? (nodeValue)
    disconnected the ? input of ?
    set ?.controlOperator = Hold Prior
    disconnected the ? input of ?
    connected ? -> ? (?)
    set ?.controlOperator = Output Zero
    disconnected the ? input of ?
    connected ? -> ? (?)
    disconnected the ? input of ?
    connected ? -> ? (?)
    disconnected the ? input of ?
    connected ? -> ? (?)
    set ?.controlOperator = Hold Prior
    disconnected the ? input of ?
    connected ? -> ? (?)
    set ?.controlOperator = Hold Current
    disconnected the ? input of ?
    connected ? -> ? (?)
    disconnected the ? input of ?
    connected ? -> ? (?)
    set ?.controlOperator = Hold Prior
    disconnected the ? input of ?
    connected ? -> ? (?)
    disconnected the ? input of ?
    connected ? -> ? (?)
    disconnected the num1 input of ?
    disconnected the ? input of ?
    connected ? -> ? (?)
    connected ? -> ? (num1)
    disconnected the num1 input of ?
    disconnected the ? input of ?
    connected ? -> ? (?)
    connected ? -> ? (num1)
    disconnected the num1 input of ?
    disconnected the ? input of ?
    connected ? -> ? (?)
    connected ? -> ? (num1)
    disconnected the ? input of ?
    connected ? -> ? (?)
  Outside Program (110s, absent)
    sim: not running
2. 2024-02-26 14:46:42, history start 76, duration 2m 31s
  Program Changes (72s, 7 targets)
    disconnected the ? input of ?
    connected ? -> ? (?)
    disconnected the ? input of ?
    connected ? -> ? (?)
    disconnected the num2 input of ?
    deleted the ? node
    disconnected the ? input of ?
    added a Sensor node
    connected ? -> ? (?)
    disconnected the ? input of ?
    connected ? -> ? (?)
    disconnected the ? input of ?
    connected ? -> ? (?)
    deleted the Sensor node
    added a Generator node
    disconnected the ? input of ?
    connected ? -> ? (?)
    disconnected the ? input of ?
    connected ? -> ? (?)
    deleted the Generator node
    added a Sensor node
    disconnected the ? input of ?
    connected ? -> ? (?)
    disconnected the ? input of ?
    connected ? -> ? (?)
    disconnected the ? input of ?
    set Sensor.type = emg-reading
    set Sensor.sensor = SIMemg_key
    connected ? -> ? (?)
    disconnected the ? input of ?
    connected ? -> ? (?)
    disconnected the ? input of ?
    connected ? -> ? (?)
    deleted the ? node
    disconnected the ? input of ?
    connected ? -> ? (?)
    disconnected the ? input of ?
    connected ? -> ? (?)
    deleted the ? node
    added a Live Output node
    set Live Output.hubSelect = Simulated Gripper
  Outside Program (79s, present unknown)
    sim: no change
```

### ep-10

- **date:** 2024-02-26
- **unit/problem:** brain 3
- **document:** `doc-03`
- **outputs:** Live Output Simulated Gripper
- **ticks:** 2 of 3 pauses covered
- **cycles:** 3
- **changes:** 9 node, 12 conn, 5 param
- **start:** 2024-02-26 14:53:46 · entry 1806 of 8400 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-03&studentDocumentHistoryId=entry-19)
- **end:** 2024-02-28 19:28:53 · entry 4192 of 8400 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-03&studentDocumentHistoryId=entry-20)

```
1. 2024-02-26 14:53:46, history start 1806, duration 52h 33m
  Program Changes (21s, 5 targets)
    disconnected the num1 input of Transform
    connected Logic -> Logic (num1)
    disconnected the num1 input of Logic
    disconnected the num1 input of Logic
    connected Sensor -> Logic (num1)
    deleted the Logic node
    deleted the Sensor node
    deleted the Number node
  Outside Program (52h 33m, long)
    sim: no change
2. 2024-02-28 19:27:45, history start 3309, duration 68s
  Program Changes (19s, 4 targets)
    set Live Output.hubSelect = Simulated Gripper
    added a Sensor node
    set Sensor.type = fsr-reading
    set Sensor.sensor = SIMpressure_key
    added a Number node
    added a Logic node
  Outside Program (49s, present unknown)
    sim: no change
3. 2024-02-28 19:28:53, history start 3821, duration 89s
  Program Changes (61s, 6 targets)
    connected Sensor -> Logic (num1)
    connected Number -> Logic (num2)
    added a Control node
    set Control.controlOperator = Hold Prior
    deleted the Logic node
    added a Math node
    set Math.mathOperator = Divide
    connected Sensor -> Math (num1)
    connected ? -> Math (num2)
    connected Math -> Transform (num1)
    connected Transform -> Live Output (nodeValue)
    disconnected the nodeValue input of Live Output
  Outside Program (28s, present unknown)
    sim: no change (Gripper 100, Surface Pressure 300)
```

### ep-12

- **date:** 2024-02-28
- **unit/problem:** brain 3
- **document:** `doc-03`
- **outputs:** Live Output Simulated Gripper
- **ticks:** 1 of 2 pauses covered
- **cycles:** 2
- **changes:** 9 conn (Control, Live Output)
- **start:** 2024-02-28 19:30:55 · entry 4330 of 8400 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-03&studentDocumentHistoryId=entry-23)
- **end:** 2024-02-28 19:33:31 · entry 4943 of 8400 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-03&studentDocumentHistoryId=entry-24)

```
1. 2024-02-28 19:30:55, history start 4330, duration 2m 36s
  Program Changes (28s, 2 targets)
    disconnected the num1 input of Control
    connected Logic -> Control (num1)
    disconnected the num1 input of Control
    connected Logic -> Control (num1)
    connected Control -> Live Output (nodeValue)
  Outside Program (2m 8s, present unknown)
    tested Target EMG x4
    sim: Gripper 45..100 x144, Surface Pressure 0..300 x93
2. 2024-02-28 19:33:31, history start 4901, duration 5m 35s
  Program Changes (15s, 2 targets)
    disconnected the num1 input of Control
    connected Logic -> Control (num1)
    disconnected the nodeValue input of Live Output
    connected Control -> Live Output (nodeValue)
  Outside Program (5m 20s, long)
    tested Target EMG x1
    sim: Gripper 81..100 x88, Surface Pressure 158..300 x85
```

### ep-13

- **date:** 2024-02-29
- **unit/problem:** brain 3
- **document:** `doc-03`
- **outputs:** none
- **ticks:** none during this episode (the document has some)
- **cycles:** 2
- **changes:** 28 conn, 1 param
- **start:** 2024-02-29 14:43:54 · entry 7364 of 8400 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-03&studentDocumentHistoryId=entry-25)
- **end:** 2024-02-29 15:31:20 · entry 8102 of 8400 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-03&studentDocumentHistoryId=entry-26)

```
1. 2024-02-29 14:43:54, history start 7364, duration 47m 26s
  Program Changes (101s, 2 targets)
    connected ? -> ? (num2)
    disconnected the ? input of ?
    connected ? -> ? (?)
    connected ? -> ? (nodeValue)
    disconnected the ? input of ?
    connected ? -> ? (num1)
    disconnected the ? input of ?
    connected ? -> ? (?)
    disconnected the ? input of ?
    connected ? -> ? (?)
    disconnected the ? input of ?
    connected ? -> ? (?)
    disconnected the ? input of ?
    connected ? -> ? (?)
    disconnected the ? input of ?
    connected ? -> ? (?)
    set ?.controlOperator = Hold Prior
    disconnected the ? input of ?
    connected ? -> ? (?)
    disconnected the ? input of ?
    connected ? -> ? (?)
    disconnected the ? input of ?
    connected ? -> ? (?)
    disconnected the ? input of ?
    connected ? -> ? (?)
    disconnected the ? input of ?
    connected ? -> ? (?)
  Outside Program (45m 45s, long)
    sim: Gripper 81..91 x66, Surface Pressure 158..233 x61
2. 2024-02-29 15:31:20, history start 8101, then no further edits
  Program Changes (0s)
    disconnected the ? input of ?
    connected ? -> ? (?)
  Outside Program (no further edits, showing 120s)
    sim: Gripper 81..90 x107, Surface Pressure 158..225 x107
```

### ep-14

- **date:** 2024-02-26
- **unit/problem:** brain 2
- **document:** `doc-04`
- **outputs:** Demo Output Light Bulb, Live Output Simulated Gripper
- **ticks:** 2 of 2 pauses covered
- **cycles:** 2
- **changes:** 11 node, 11 conn, 9 param
- **start:** 2024-02-26 13:34:11 · entry 2589 of 14686 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-04&studentDocumentHistoryId=entry-27)
- **end:** 2024-02-26 13:36:56 · entry 3424 of 14686 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-04&studentDocumentHistoryId=entry-28)

```
1. 2024-02-26 13:34:11, history start 2589, duration 2m 46s
  Program Changes (109s, 8 targets)
    set ?.hubSelect = ⚠️ connect device
    added a Sensor node
    set Sensor.type = fsr-reading
    set Sensor.sensor = fsr
    deleted the Sensor node
    added a Sensor node
    set Sensor.type = fsr-reading
    set Sensor.sensor = SIMpressure_key
    added a Number node
    added a Number node
    connected ? -> ? (num1)
    connected ? -> ? (num2)
    connected ? -> ? (nodeValue)
    deleted the ? node
    added a Demo Output node
    added a Live Output node
    set Live Output.hubSelect = Simulated Gripper
    connected ? -> Live Output (nodeValue)
    deleted the Demo Output node
  Outside Program (57s, present unknown)
    tested Target EMG x2
    sim: Gripper 0..100 x5, Surface Pressure 0..300 x5
2. 2024-02-26 13:36:56, history start 3136, duration 2m 35s
  Program Changes (117s, 3 targets)
    added a Control node
    set Control.controlOperator = Hold Prior
    disconnected the nodeValue input of Live Output
    added a Logic node
    connected Sensor -> Logic (num1)
    connected Logic -> Control (num1)
    connected ? -> Control (num2)
    disconnected the num2 input of Control
    connected ? -> Control (num2)
    connected Control -> Live Output (nodeValue)
    set Control.controlOperator = Hold Current
    set Control.controlOperator = Output Zero
  Outside Program (38s, present unknown)
    sim: Gripper 0..100 x16, Surface Pressure 0..300 x16
```

### ep-16

- **date:** 2024-02-26
- **unit/problem:** brain 2
- **document:** `doc-04`
- **outputs:** Live Output Simulated Gripper
- **ticks:** 2 of 2 pauses covered
- **cycles:** 2
- **changes:** 4 node, 3 conn, 3 param
- **start:** 2024-02-26 13:45:57 · entry 5213 of 14686 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-04&studentDocumentHistoryId=entry-30)
- **end:** 2024-02-26 13:47:56 · entry 6126 of 14686 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-04&studentDocumentHistoryId=entry-31)

```
1. 2024-02-26 13:45:57, history start 5213, duration 119s
  Program Changes (7s)
    added a Transform node
    deleted the Transform node
  Outside Program (112s, present unknown)
    tested Target EMG x1
    sim: Gripper 0..100 x165, Surface Pressure 0..300 x166
2. 2024-02-26 13:47:56, history start 6032, duration 119s
  Program Changes (24s, 4 targets)
    disconnected the nodeValue input of Live Output
    deleted the Control node
    added a Transform node
    connected ? -> Transform (num1)
    set Transform.transformOperator = Ramp
    connected Transform -> Live Output (nodeValue)
    set Transform.plot = true
    set ?.plot = true
  Outside Program (95s, present unknown)
    tested Target EMG x4
    sim: Gripper 5..100 x60, Surface Pressure 0..300 x23
```

### ep-18

- **date:** 2024-02-27
- **unit/problem:** brain 3
- **document:** `doc-05`
- **outputs:** Demo Output Grabber
- **ticks:** none during this episode (the document has some)
- **cycles:** 3
- **changes:** 13 node, 42 conn, 6 param
- **start:** 2024-02-27 15:45:07 · entry 34 of 2528 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-05&studentDocumentHistoryId=entry-34)
- **end:** 2024-02-27 15:49:08 · entry 153 of 2528 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-05&studentDocumentHistoryId=entry-35)

```
1. 2024-02-27 15:45:07, history start 34, duration 55s
  Program Changes (30s, 3 targets)
    disconnected the num1 input of Transform
    set Generator.generatorType = Sine
    deleted the Transform node
    added a Demo Output node
  Outside Program (26s, present unknown)
    sim: not running
2. 2024-02-27 15:46:02, history start 52, duration 3m 5s
  Program Changes (2m 5s, 3 targets)
    set Demo Output.outputType = Grabber
    connected ? -> Demo Output (?)
    disconnected the ? input of Demo Output
    added a Number node
    connected ? -> Demo Output (?)
    disconnected the ? input of Demo Output
    connected ? -> Demo Output (?)
    connected Generator -> Control (num2)
    disconnected the ? input of Demo Output
    connected ? -> Demo Output (?)
    disconnected the ? input of Demo Output
    connected ? -> Demo Output (?)
    connected Control -> Demo Output (nodeValue)
    disconnected the ? input of Demo Output
    connected Control -> Demo Output (nodeValue)
    disconnected the ? input of Demo Output
    disconnected the nodeValue input of Demo Output
    connected ? -> Demo Output (?)
    disconnected the ? input of Demo Output
    connected ? -> Demo Output (?)
    disconnected the ? input of Demo Output
    connected ? -> Demo Output (?)
    disconnected the ? input of Demo Output
    connected ? -> Demo Output (?)
    connected Number -> Control (num1)
    disconnected the ? input of Demo Output
    connected ? -> Demo Output (?)
    connected Control -> Demo Output (nodeValue)
    disconnected the ? input of Demo Output
    disconnected the ? input of Demo Output
    connected ? -> Demo Output (?)
    disconnected the ? input of Demo Output
    connected ? -> Demo Output (?)
  Outside Program (61s, present unknown)
    sim: not running
3. 2024-02-27 15:49:08, history start 106, duration 3m 57s
  Program Changes (2m 1s, 9 targets)
    disconnected the ? input of Demo Output
    connected ? -> Demo Output (?)
    disconnected the ? input of Demo Output
    connected ? -> Demo Output (?)
    deleted the Control node
    deleted the Demo Output node
    deleted the Number node
    deleted the Generator node
    added a Number node
    added a Sensor node
    set Sensor.type = emg-reading
    added a Math node
    set Math.mathOperator = Divide
    added a Demo Output node
    set Demo Output.outputType = Grabber
    connected ? -> Demo Output (?)
    disconnected the ? input of Demo Output
    connected ? -> Demo Output (?)
    deleted the Demo Output node
    added a Live Output node
    set Live Output.hubSelect = ⚠️ connect device
    connected Sensor -> Math (num1)
    connected Number -> Math (num2)
    connected Math -> Live Output (nodeValue)
  Outside Program (116s, present unknown)
    sim: not running
```

### ep-19

- **date:** 2024-02-27
- **unit/problem:** brain 3
- **document:** `doc-05`
- **outputs:** Live Output Simulated Gripper
- **ticks:** 2 of 2 pauses covered
- **cycles:** 2
- **changes:** 1 node, 13 conn, 1 param
- **start:** 2024-02-27 15:56:41 · entry 341 of 2528 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-05&studentDocumentHistoryId=entry-36)
- **end:** 2024-02-27 15:59:13 · entry 674 of 2528 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-05&studentDocumentHistoryId=entry-37)

```
1. 2024-02-27 15:56:41, history start 341, duration 2m 32s
  Program Changes (73s, 2 targets)
    added a Transform node
    set Transform.transformOperator = Ramp
    connected Transform -> Live Output (nodeValue)
    disconnected the nodeValue input of Live Output
    disconnected the nodeValue input of Live Output
    connected Number -> Transform (num1)
    connected Transform -> Live Output (nodeValue)
  Outside Program (79s, present unknown)
    tested Target EMG x5
    sim: no change
2. 2024-02-27 15:59:13, history start 616, duration 115s
  Program Changes (32s, 3 targets)
    disconnected the nodeValue input of Live Output
    connected Transform -> Live Output (nodeValue)
    disconnected the num2 input of Math
    connected Number -> Math (num2)
    disconnected the num1 input of Transform
    connected Number -> Transform (num1)
    disconnected the num1 input of Transform
    connected Math -> Transform (num1)
  Outside Program (84s, present unknown)
    tested Target EMG x2
    sim: Gripper 18..100 x69, Surface Pressure 0..300 x14
```

### ep-20

- **date:** 2024-02-27
- **unit/problem:** brain 3
- **document:** `doc-05`
- **outputs:** Live Output Simulated Gripper
- **ticks:** 3 of 3 pauses covered
- **cycles:** 3
- **changes:** 1 node, 25 conn
- **start:** 2024-02-27 16:06:14 · entry 1265 of 2528 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-05&studentDocumentHistoryId=entry-38)
- **end:** 2024-02-27 16:09:48 · entry 1536 of 2528 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-05&studentDocumentHistoryId=entry-39)

```
1. 2024-02-27 16:06:14, history start 1265, duration 79s
  Program Changes (35s, 4 targets)
    disconnected the num1 input of Math
    connected Sensor -> Control (num2)
    disconnected the num2 input of Logic
    connected Sensor -> Control (num1)
    disconnected the nodeValue input of Live Output
    connected Control -> Live Output (nodeValue)
  Outside Program (44s, present unknown)
    sim: no change (Gripper 100, Surface Pressure 300)
2. 2024-02-27 16:07:33, history start 1339, duration 2m 15s
  Program Changes (45s)
    disconnected the num1 input of Control
    connected Sensor -> Control (num1)
    disconnected the num2 input of Control
    disconnected the num1 input of Control
    connected Sensor -> Control (num2)
    connected Sensor -> Control (num1)
    disconnected the num2 input of Control
    disconnected the num1 input of Control
    connected Sensor -> Control (num2)
    connected Sensor -> Control (num1)
  Outside Program (90s, present unknown)
    tested Target EMG x3
    sim: no change
3. 2024-02-27 16:09:48, history start 1460, duration 15m 41s
  Program Changes (72s, 4 targets)
    disconnected the num2 input of Control
    connected Sensor -> Math (num1)
    connected Transform -> Control (num2)
    disconnected the num1 input of Control
    connected Logic -> Control (num1)
    connected Sensor -> Logic (num2)
    added a Number node
    connected Number -> Logic (num1)
    disconnected the num1 input of Logic
    connected Number -> Logic (num1)
  Outside Program (14m 29s, long)
    tested Target EMG x6
    sim: Gripper 9..100 x224, Surface Pressure 0..300 x24
```

## trial_and_error — control (3 shown)

### ep-02

- **date:** 2024-02-16
- **unit/problem:** brain 5
- **document:** `doc-01`
- **outputs:** Demo Output Grabber
- **ticks:** none -- this document has no tick data at all
- **cycles:** 1
- **changes:** 2 node, 2 conn (Demo Output, Live Output)
- **start:** 2024-02-16 14:19:28 · entry 51 of 81 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-01&studentDocumentHistoryId=entry-03)
- **end:** 2024-02-16 14:19:28 · entry 55 of 81 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-01&studentDocumentHistoryId=entry-04)

```
1. 2024-02-16 14:19:28, history start 51, duration 30s
  Program Changes (3s, 2 targets)
    disconnected the ? input of Demo Output
    connected ? -> Demo Output (?)
    deleted the Demo Output node
    added a Live Output node
  Outside Program (27s, present unknown)
    sim: not running
```

### ep-09

- **date:** 2024-02-26
- **unit/problem:** brain 3
- **document:** `doc-03`
- **outputs:** Live Output Physical Gripper
- **ticks:** 1 of 1 pauses covered
- **cycles:** 1
- **changes:** 1 node, 3 conn, 1 param (Live Output, Transform)
- **start:** 2024-02-26 14:51:16 · entry 1432 of 8400 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-03&studentDocumentHistoryId=entry-17)
- **end:** 2024-02-26 14:51:16 · entry 1504 of 8400 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-03&studentDocumentHistoryId=entry-18)

```
1. 2024-02-26 14:51:16, history start 1432, duration 64s
  Program Changes (25s, 2 targets)
    disconnected the nodeValue input of Live Output
    added a Transform node
    set Transform.transformOperator = Ramp
    connected Logic -> Transform (num1)
    connected Transform -> Live Output (nodeValue)
  Outside Program (39s, present unknown)
    tested Target EMG x2
    sim: no change
```

### ep-17

- **date:** 2024-02-27
- **unit/problem:** brain 2
- **document:** `doc-04`
- **outputs:** none
- **ticks:** none during this episode (the document has some)
- **cycles:** 1
- **changes:** 1 node, 3 conn, 1 param (Transform)
- **start:** 2024-02-27 13:32:30 · entry 13252 of 14686 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-04&studentDocumentHistoryId=entry-32)
- **end:** 2024-02-27 13:32:30 · entry 13427 of 14686 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-04&studentDocumentHistoryId=entry-33)

```
1. 2024-02-27 13:32:30, history start 13252, then no further edits
  Program Changes (21s, 2 targets)
    disconnected the nodeValue input of ?
    added a Transform node
    set Transform.transformOperator = Ramp
    connected ? -> Transform (num1)
    connected Transform -> ? (nodeValue)
  Outside Program (no further edits, showing 120s)
    tested Target EMG x3
    sim: Gripper 10..100 x168, Surface Pressure 0..300 x119
```
