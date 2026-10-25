# CLUE Dataflow: trial and error vs. systematicity

```
episodes: 386 (90 systematic, 296 trial-and-error)
replay links: 386 of 386 episodes
  offering id from rtdb                 386
```

## Detection stages

### Log events (build_log_events.py)

```
log events: 18177 rows, 164 documents, 23 users
```

### Population (build_population.py)

```
population: 153 documents, 2 clock-suspect, 151 usable
```

### Edits (build_edits.py)

```
edits: 54032 operations
  runtime           18743   34.7%
  documentation      9703   18.0%
  structure          7115   13.2%
  other              5773   10.7%
  tile               5762   10.7%
  layout             3847    7.1%
  parameter          1376    2.5%
  ambiguous          1121    2.1%
  derived             403    0.7%
  undo                189    0.3%
```

### Presence (build_presence.py)

```
presence: 709 intervals across 53 documents, 0 coarse-rate, median length 0.0s
```

### Slider trials (build_trials.py)

```
slider trials: 503 across 41 documents (1176 moves, 147 with >=3 moves)
  median 2 moves, 4.2s; p90 duration 38.7s
  360 of 503 (71.6%) follow a program edit within 120s
by simulation:
  EMG_and_claw               43 docs,  40 with trials,   497 trials
  (no simulator tile)       110 docs,   1 with trials,     6 trials
```

### Sensor trials (build_sensor_trials.py)

```
physical-sensor population:
  documents in the analysis population         153
    ...containing a Sensor node                 98
    ...with that Sensor bound to a device       43
    ...and carrying tickAndProcess history       0
    ...yielding at least one detected trial      0
sensor trials: 0
```

### Cycles (build_cycles.py)

```
cycles: 1480 (burst gap 25.0s)
  present_unknown         930   62.8%
  unknown                 241   16.3%
  long                    168   11.4%
  documenting              44    3.0%
  watching                 38    2.6%
  absent                   24    1.6%
  reading                  14    0.9%
  watching_weak            11    0.7%
  no_presence_data         10    0.7%
composition: 50.2% single-target, 23.2% 3+ targets, 46.7% oscillating, 21.9% followed by a trial
```

## Episodes

| episode_id | doc_id | owner | unit | problem | tile_id | kind | n_cycles | purity | span_s | started | ended | first_entry_id | last_entry_id | first_entry_idx | last_entry_idx | n_entries | outputs | ticks_available | n_ticks_cover | stratum | offering_source |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ep-001 | doc-001 | Student 1001 | brain | 1 | tile-001 | trial_and_error | 2 | 1.0 | 57.141 | 2024-02-05 18:25:42.977 | 2024-02-05 18:26:40.118 | entry-001 | entry-002 | 121 | 146 | 600 |  | false | 0 | boundary | rtdb |
| ep-002 | doc-001 | Student 1001 | brain | 1 | tile-001 | trial_and_error | 8 | 1.0 | 1102.435 | 2024-02-05 18:30:37.987 | 2024-02-05 18:49:00.422 | entry-003 | entry-004 | 159 | 541 | 600 | Demo Output Light Bulb | false | 0 | strong | rtdb |
| ep-003 | doc-002 | Student 1002 | brain | 1 | tile-002 | systematic | 1 | 1.0 | 0.0 | 2024-02-05 18:25:37.479 | 2024-02-05 18:25:37.479 | entry-005 | entry-005 | 169 | 169 | 742 |  | false | 0 | control | rtdb |
| ep-004 | doc-002 | Student 1002 | brain | 1 | tile-002 | trial_and_error | 3 | 0.6666666666666666 | 599.939 | 2024-02-05 18:26:13.031 | 2024-02-05 18:36:12.97 | entry-006 | entry-007 | 180 | 293 | 742 |  | false | 0 | boundary | rtdb |
| ep-005 | doc-002 | Student 1002 | brain | 1 | tile-003 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-05 18:30:46.707 | 2024-02-05 18:30:46.707 | entry-008 | entry-009 | 220 | 221 | 742 |  | false | 0 | control | rtdb |
| ep-006 | doc-003 | Student 1003 | brain | 1 | tile-004 | trial_and_error | 2 | 1.0 | 177.098 | 2024-02-05 18:36:53.516 | 2024-02-05 18:39:50.614 | entry-010 | entry-011 | 614 | 763 | 2300 | Demo Output Light Bulb | false | 0 | boundary | rtdb |
| ep-007 | doc-003 | Student 1003 | brain | 1 | tile-004 | trial_and_error | 5 | 0.8 | 962.831 | 2024-03-01 16:13:28.497 | 2024-03-01 16:29:31.328 | entry-012 | entry-013 | 1595 | 2204 | 2300 | Demo Output Light Bulb, Live Output Physical Gripper | false | 0 | strong | rtdb |
| ep-008 | doc-003 | Student 1003 | brain | 1 | tile-005 | trial_and_error | 3 | 0.6666666666666666 | 106.83 | 2024-02-05 18:30:30.356 | 2024-02-05 18:32:17.186 | entry-014 | entry-015 | 498 | 527 | 2300 |  | false | 0 | boundary | rtdb |
| ep-009 | doc-003 | Student 1003 | brain | 1 | tile-006 | trial_and_error | 3 | 1.0 | 330.69 | 2024-02-05 18:22:57.773 | 2024-02-05 18:28:28.463 | entry-016 | entry-017 | 280 | 486 | 2300 | Demo Output Light Bulb | false | 0 | boundary | rtdb |
| ep-010 | doc-004 | Student 1004 | brain | 1 | tile-007 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-05 18:32:01.177 | 2024-02-05 18:32:01.177 | entry-018 | entry-019 | 279 | 292 | 692 |  | false | 0 | control | rtdb |
| ep-011 | doc-004 | Student 1004 | brain | 1 | tile-008 | trial_and_error | 6 | 0.8333333333333334 | 767.258 | 2024-02-05 18:26:14.603 | 2024-02-05 18:39:01.861 | entry-020 | entry-021 | 170 | 408 | 692 | Demo Output Light Bulb | false | 0 | strong | rtdb |
| ep-012 | doc-005 | Student 1005 | brain | 1 | tile-009 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-05 18:43:41.874 | 2024-02-05 18:43:41.874 | entry-022 | entry-023 | 178 | 195 | 403 | Demo Output Light Bulb | false | 0 | control | rtdb |
| ep-013 | doc-005 | Student 1005 | brain | 1 | tile-010 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-05 18:27:20.341 | 2024-02-05 18:27:20.341 | entry-024 | entry-025 | 106 | 125 | 403 |  | false | 0 | control | rtdb |
| ep-014 | doc-006 | Student 1006 | brain | 1 | tile-011 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-05 18:27:48.498 | 2024-02-05 18:27:48.498 | entry-026 | entry-027 | 620 | 637 | 653 |  | true | 0 | control | rtdb |
| ep-015 | doc-007 | Student 1007 | brain | 1 | tile-012 | trial_and_error | 5 | 0.8 | 504.002 | 2024-02-05 18:27:10.98 | 2024-02-05 18:35:34.982 | entry-028 | entry-029 | 122 | 188 | 356 | Demo Output Light Bulb | false | 0 | strong | rtdb |
| ep-016 | doc-007 | Student 1007 | brain | 1 | tile-012 | trial_and_error | 2 | 1.0 | 187.198 | 2024-02-05 18:39:19.128 | 2024-02-05 18:42:26.326 | entry-030 | entry-031 | 221 | 281 | 356 | Demo Output Light Bulb, Live Output unset | false | 0 | boundary | rtdb |
| ep-017 | doc-008 | Student 1008 | brain | 1 | tile-013 | trial_and_error | 2 | 1.0 | 66.779 | 2024-02-05 18:32:07.737 | 2024-02-05 18:33:14.516 | entry-032 | entry-033 | 334 | 345 | 676 |  | false | 0 | boundary | rtdb |
| ep-018 | doc-008 | Student 1008 | brain | 1 | tile-014 | trial_and_error | 4 | 1.0 | 1128.641 | 2024-02-05 18:25:19.176 | 2024-02-05 18:44:07.817 | entry-034 | entry-035 | 290 | 417 | 676 | Demo Output Light Bulb, Live Output ⚠️ connect device | false | 0 | strong | rtdb |
| ep-019 | doc-009 | Student 1009 | brain | 1 | tile-015 | trial_and_error | 4 | 0.75 | 336.4 | 2024-02-05 18:38:12.731 | 2024-02-05 18:43:49.131 | entry-036 | entry-037 | 338 | 439 | 680 | Demo Output Light Bulb | false | 0 | strong | rtdb |
| ep-020 | doc-009 | Student 1009 | brain | 1 | tile-016 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-05 18:25:59.644 | 2024-02-05 18:25:59.644 | entry-038 | entry-039 | 263 | 283 | 680 |  | false | 0 | control | rtdb |
| ep-021 | doc-009 | Student 1009 | brain | 1 | tile-017 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-05 18:37:03.8 | 2024-02-05 18:37:03.8 | entry-040 | entry-041 | 322 | 333 | 680 |  | false | 0 | control | rtdb |
| ep-022 | doc-010 | Student 1010 | brain | 1 | tile-018 | trial_and_error | 5 | 1.0 | 966.288 | 2024-02-05 18:25:39.634 | 2024-02-05 18:41:45.922 | entry-042 | entry-043 | 84 | 307 | 503 | Demo Output Light Bulb | false | 0 | strong | rtdb |
| ep-023 | doc-011 | Student 1011 | brain | 1 | tile-019 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-05 18:35:07.432 | 2024-02-05 18:35:07.432 | entry-044 | entry-045 | 296 | 301 | 844 |  | false | 0 | control | rtdb |
| ep-024 | doc-011 | Student 1011 | brain | 1 | tile-019 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-05 18:38:34.025 | 2024-02-05 18:38:34.025 | entry-046 | entry-047 | 336 | 342 | 844 | Demo Output Light Bulb | false | 0 | control | rtdb |
| ep-025 | doc-011 | Student 1011 | brain | 1 | tile-020 | trial_and_error | 4 | 0.75 | 169.066 | 2024-02-05 18:30:22.538 | 2024-02-05 18:33:11.604 | entry-048 | entry-049 | 263 | 294 | 844 |  | false | 0 | strong | rtdb |
| ep-026 | doc-012 | Student 1012 | brain | 1 | tile-021 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-05 18:30:10.006 | 2024-02-05 18:30:10.006 | entry-050 | entry-051 | 516 | 583 | 963 |  | true | 0 | control | rtdb |
| ep-027 | doc-012 | Student 1012 | brain | 1 | tile-022 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-05 18:32:05.065 | 2024-02-05 18:32:05.065 | entry-052 | entry-053 | 587 | 598 | 963 |  | true | 0 | control | rtdb |
| ep-028 | doc-012 | Student 1012 | brain | 1 | tile-023 | trial_and_error | 3 | 1.0 | 229.354 | 2024-02-05 18:33:22.669 | 2024-02-05 18:37:12.023 | entry-054 | entry-055 | 602 | 719 | 963 | Demo Output Light Bulb | true | 0 | boundary | rtdb |
| ep-029 | doc-013 | Student 1013 | brain | 1 | tile-024 | trial_and_error | 4 | 0.75 | 690.981 | 2024-02-05 18:25:26.614 | 2024-02-05 18:36:57.595 | entry-056 | entry-057 | 315 | 911 | 1545 | Demo Output Light Bulb | false | 0 | strong | rtdb |
| ep-030 | doc-014 | Student 1014 | brain | 1 | tile-025 | trial_and_error | 5 | 0.8 | 832.778 | 2024-02-05 18:25:38.931 | 2024-02-05 18:39:31.709 | entry-058 | entry-059 | 285 | 573 | 1015 | Demo Output Light Bulb | false | 0 | strong | rtdb |
| ep-031 | doc-015 | Student 1015 | brain | 1 | tile-026 | trial_and_error | 6 | 0.6666666666666666 | 1033.915 | 2024-02-05 18:26:46.175 | 2024-02-05 18:44:00.09 | entry-060 | entry-061 | 258 | 476 | 921 | Demo Output Light Bulb | false | 0 | strong | rtdb |
| ep-032 | doc-016 | Student 1016 | brain | 1 | tile-027 | trial_and_error | 3 | 1.0 | 215.873 | 2024-02-05 18:32:37.697 | 2024-02-05 18:36:13.57 | entry-062 | entry-063 | 348 | 505 | 922 |  | false | 0 | boundary | rtdb |
| ep-033 | doc-016 | Student 1016 | brain | 1 | tile-027 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-05 18:50:44.142 | 2024-02-05 18:50:44.142 | entry-064 | entry-065 | 900 | 916 | 922 | Demo Output Light Bulb | false | 0 | control | rtdb |
| ep-034 | doc-016 | Student 1016 | brain | 1 | tile-028 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-05 18:27:36.032 | 2024-02-05 18:27:36.032 | entry-066 | entry-067 | 317 | 321 | 922 |  | false | 0 | control | rtdb |
| ep-035 | doc-017 | Student 1017 | brain | 1 | tile-029 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-05 18:26:56.011 | 2024-02-05 18:26:56.011 | entry-068 | entry-069 | 183 | 187 | 855 |  | false | 0 | control | rtdb |
| ep-036 | doc-017 | Student 1017 | brain | 1 | tile-029 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-05 18:29:01.576 | 2024-02-05 18:29:01.576 | entry-070 | entry-071 | 208 | 252 | 855 |  | false | 0 | control | rtdb |
| ep-037 | doc-017 | Student 1017 | brain | 1 | tile-029 | trial_and_error | 8 | 0.875 | 567.197 | 2024-02-05 18:31:50.367 | 2024-02-05 18:41:17.564 | entry-072 | entry-073 | 332 | 648 | 855 | Demo Output Light Bulb | false | 0 | strong | rtdb |
| ep-038 | doc-017 | Student 1017 | brain | 1 | tile-029 | trial_and_error | 2 | 1.0 | 98.445 | 2024-02-05 18:43:53.061 | 2024-02-05 18:45:31.506 | entry-074 | entry-075 | 665 | 707 | 855 | Demo Output Light Bulb | false | 0 | boundary | rtdb |
| ep-039 | doc-018 | Student 1018 | brain | 1 | tile-030 | trial_and_error | 5 | 0.8 | 684.573 | 2024-02-05 18:25:33.748 | 2024-02-05 18:36:58.321 | entry-076 | entry-077 | 90 | 231 | 517 | Demo Output Light Bulb | false | 0 | strong | rtdb |
| ep-040 | doc-018 | Student 1018 | brain | 1 | tile-031 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-05 18:30:48.383 | 2024-02-05 18:30:48.383 | entry-078 | entry-079 | 128 | 135 | 517 |  | false | 0 | control | rtdb |
| ep-041 | doc-019 | Student 1019 | brain | 1 | tile-032 | trial_and_error | 7 | 0.8571428571428571 | 815.54 | 2024-02-05 18:25:29.158 | 2024-02-05 18:39:04.698 | entry-080 | entry-081 | 199 | 352 | 496 | Demo Output Light Bulb | false | 0 | strong | rtdb |
| ep-042 | doc-020 | Student 1020 | brain | 1 | tile-033 | trial_and_error | 6 | 0.8333333333333334 | 627.722 | 2024-02-05 18:26:25.942 | 2024-02-05 18:36:53.664 | entry-082 | entry-083 | 195 | 355 | 517 | Demo Output Light Bulb | false | 0 | strong | rtdb |
| ep-043 | doc-020 | Student 1020 | brain | 1 | tile-034 | trial_and_error | 3 | 1.0 | 268.342 | 2024-02-05 18:30:46.571 | 2024-02-05 18:35:14.913 | entry-084 | entry-085 | 253 | 283 | 517 | Demo Output Light Bulb | false | 0 | boundary | rtdb |
| ep-044 | doc-021 | Student 1021 | brain | 1 | tile-035 | trial_and_error | 2 | 1.0 | 56.867 | 2024-02-05 18:21:58.715 | 2024-02-05 18:22:55.582 | entry-086 | entry-087 | 2 | 24 | 494 |  | false | 0 | boundary | rtdb |
| ep-045 | doc-021 | Student 1021 | brain | 1 | tile-035 | trial_and_error | 4 | 1.0 | 386.497 | 2024-02-05 18:25:45.449 | 2024-02-05 18:32:11.946 | entry-088 | entry-089 | 33 | 151 | 494 | Demo Output Light Bulb | false | 0 | strong | rtdb |
| ep-046 | doc-021 | Student 1021 | brain | 1 | tile-035 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-05 18:35:30.756 | 2024-02-05 18:35:30.756 | entry-090 | entry-091 | 175 | 196 | 494 | Demo Output Light Bulb | false | 0 | control | rtdb |
| ep-047 | doc-022 | Student 1008 | brain | 2 | tile-036 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-09 15:58:14.068 | 2024-02-09 15:58:14.068 | entry-092 | entry-093 | 723 | 729 | 1865 |  | false | 0 | control | rtdb |
| ep-048 | doc-022 | Student 1008 | brain | 2 | tile-036 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-09 16:00:58.667 | 2024-02-09 16:00:58.667 | entry-094 | entry-095 | 767 | 770 | 1865 |  | false | 0 | control | rtdb |
| ep-049 | doc-023 | Student 1018 | brain | 2 | tile-037 | trial_and_error | 2 | 1.0 | 123.618 | 2024-02-09 15:58:28.486 | 2024-02-09 16:00:32.104 | entry-096 | entry-097 | 946 | 986 | 2169 |  | false | 0 | boundary | rtdb |
| ep-050 | doc-024 | Student 1004 | brain | 2 | tile-038 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-09 15:58:33.718 | 2024-02-09 15:58:33.718 | entry-098 | entry-099 | 870 | 874 | 1888 |  | false | 0 | control | rtdb |
| ep-051 | doc-024 | Student 1004 | brain | 2 | tile-038 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-09 16:02:09.567 | 2024-02-09 16:02:09.567 | entry-100 | entry-101 | 906 | 913 | 1888 | Demo Output Light Bulb | false | 0 | control | rtdb |
| ep-052 | doc-025 | Student 1013 | brain | 2 | tile-039 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-09 15:58:07.529 | 2024-02-09 15:58:07.529 | entry-102 | entry-103 | 1130 | 1158 | 3352 |  | false | 0 | control | rtdb |
| ep-053 | doc-026 | Student 1002 | brain | 2 | tile-040 | trial_and_error | 3 | 1.0 | 226.863 | 2024-02-09 15:58:04.098 | 2024-02-09 16:01:50.961 | entry-104 | entry-105 | 594 | 644 | 1904 |  | false | 0 | boundary | rtdb |
| ep-054 | doc-027 | Student 1015 | brain | 2 | tile-041 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-09 15:59:23.946 | 2024-02-09 15:59:23.946 | entry-106 | entry-107 | 1434 | 1474 | 3349 |  | false | 0 | control | rtdb |
| ep-055 | doc-028 | Student 1010 | brain | 2 | tile-042 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-09 15:58:11.428 | 2024-02-09 15:58:11.428 | entry-108 | entry-109 | 905 | 933 | 2222 |  | false | 0 | control | rtdb |
| ep-056 | doc-029 | Student 1009 | brain | 2 | tile-043 | trial_and_error | 2 | 1.0 | 60.811 | 2024-02-09 15:58:14.036 | 2024-02-09 15:59:14.847 | entry-110 | entry-111 | 1261 | 1279 | 2442 | Demo Output Light Bulb | false | 0 | boundary | rtdb |
| ep-057 | doc-030 | Student 1022 | brain | 2 | tile-044 | trial_and_error | 2 | 1.0 | 164.342 | 2024-02-09 15:58:54.347 | 2024-02-09 16:01:38.689 | entry-112 | entry-113 | 853 | 900 | 2226 |  | false | 0 | boundary | rtdb |
| ep-058 | doc-031 | Student 1020 | brain | 2 | tile-045 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-09 15:59:32.233 | 2024-02-09 15:59:32.233 | entry-114 | entry-115 | 888 | 914 | 2321 |  | false | 0 | control | rtdb |
| ep-059 | doc-032 | Student 1016 | brain | 2 | tile-046 | trial_and_error | 3 | 0.6666666666666666 | 137.284 | 2024-02-09 15:59:09.089 | 2024-02-09 16:01:26.373 | entry-116 | entry-117 | 626 | 1259 | 2410 |  | false | 0 | boundary | rtdb |
| ep-060 | doc-033 | Student 1001 | brain | 2 | tile-047 | trial_and_error | 3 | 0.6666666666666666 | 224.503 | 2024-02-09 15:58:55.807 | 2024-02-09 16:02:40.31 | entry-118 | entry-119 | 1026 | 1052 | 1977 |  | false | 0 | boundary | rtdb |
| ep-061 | doc-034 | Student 1019 | brain | 2 | tile-048 | trial_and_error | 2 | 1.0 | 52.325 | 2024-02-09 15:58:15.171 | 2024-02-09 15:59:07.496 | entry-120 | entry-121 | 521 | 547 | 1786 |  | false | 0 | boundary | rtdb |
| ep-062 | doc-035 | Student 1012 | brain | 2 | tile-049 | trial_and_error | 3 | 0.6666666666666666 | 111.823 | 2024-02-09 15:58:14.524 | 2024-02-09 16:00:06.347 | entry-122 | entry-123 | 476 | 506 | 963 |  | false | 0 | boundary | rtdb |
| ep-063 | doc-036 | Student 1011 | brain | 2 | tile-050 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-09 15:58:06.552 | 2024-02-09 15:58:06.552 | entry-124 | entry-125 | 388 | 415 | 1133 |  | false | 0 | control | rtdb |
| ep-064 | doc-037 | Student 1014 | brain | 2 | tile-051 | trial_and_error | 3 | 1.0 | 174.931 | 2024-02-09 15:58:21.719 | 2024-02-09 16:01:16.65 | entry-126 | entry-127 | 1393 | 1453 | 3223 |  | false | 0 | boundary | rtdb |
| ep-065 | doc-038 | Student 1006 | brain | 2 | tile-052 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-09 15:59:05.954 | 2024-02-09 15:59:05.954 | entry-128 | entry-129 | 1029 | 1035 | 3146 |  | false | 0 | control | rtdb |
| ep-066 | doc-038 | Student 1006 | brain | 2 | tile-052 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-09 16:01:23.16 | 2024-02-09 16:01:23.16 | entry-130 | entry-131 | 1050 | 1051 | 3146 | Demo Output Light Bulb | false | 0 | control | rtdb |
| ep-067 | doc-038 | Student 1006 | brain | 2 | tile-053 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-09 16:02:18.909 | 2024-02-09 16:02:18.909 | entry-132 | entry-133 | 1063 | 1085 | 3146 |  | false | 0 | control | rtdb |
| ep-068 | doc-039 | Student 1017 | brain | 2 | tile-054 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-09 16:00:14.719 | 2024-02-09 16:00:14.719 | entry-134 | entry-135 | 826 | 832 | 1551 |  | false | 0 | control | rtdb |
| ep-069 | doc-039 | Student 1017 | brain | 2 | tile-054 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-09 16:03:27.289 | 2024-02-09 16:03:27.289 | entry-136 | entry-137 | 878 | 883 | 1551 | Demo Output Light Bulb | false | 0 | control | rtdb |
| ep-070 | doc-040 | Student 1023 | brain | 2 | tile-055 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-09 15:58:21.931 | 2024-02-09 15:58:21.931 | entry-138 | entry-139 | 836 | 863 | 2035 |  | false | 0 | control | rtdb |
| ep-071 | doc-041 | Student 1005 | brain | 2 | tile-056 | trial_and_error | 2 | 1.0 | 63.835 | 2024-02-09 15:58:10.231 | 2024-02-09 15:59:14.066 | entry-140 | entry-141 | 322 | 455 | 1068 |  | false | 0 | boundary | rtdb |
| ep-072 | doc-042 | Student 1007 | brain | 2 | tile-057 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-09 16:00:45.339 | 2024-02-09 16:00:45.339 | entry-142 | entry-143 | 395 | 421 | 1461 | Demo Output Light Bulb | false | 0 | control | rtdb |
| ep-073 | doc-043 | Student 1020 | brain | 3 | tile-058 | trial_and_error | 2 | 1.0 | 137.703 | 2024-02-12 18:45:17.511 | 2024-02-12 18:47:35.214 | entry-144 | entry-145 | 1311 | 1348 | 1999 | Demo Output Light Bulb | false | 0 | boundary | rtdb |
| ep-074 | doc-044 | Student 1008 | brain | 3 | tile-059 | trial_and_error | 4 | 1.0 | 471.721 | 2024-02-12 18:44:53.293 | 2024-02-12 18:52:45.014 | entry-146 | entry-147 | 885 | 1265 | 1923 | Demo Output Light Bulb, Live Output ⚠️ connect device | false | 0 | strong | rtdb |
| ep-075 | doc-045 | Student 1018 | brain | 3 | tile-060 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-12 18:45:46.475 | 2024-02-12 18:45:46.475 | entry-148 | entry-149 | 1640 | 2022 | 2786 |  | false | 0 | control | rtdb |
| ep-076 | doc-046 | Student 1012 | brain | 3 | tile-061 | trial_and_error | 2 | 1.0 | 139.938 | 2024-02-12 18:48:02.341 | 2024-02-12 18:50:22.279 | entry-150 | entry-151 | 1275 | 3484 | 9217 |  | true | 1 | boundary | rtdb |
| ep-077 | doc-047 | Student 1004 | brain | 3 | tile-062 | trial_and_error | 3 | 1.0 | 201.083 | 2024-02-12 18:45:15.775 | 2024-02-12 18:48:36.858 | entry-152 | entry-153 | 1095 | 1220 | 1896 |  | false | 0 | boundary | rtdb |
| ep-078 | doc-048 | Student 1016 | brain | 3 | tile-063 | trial_and_error | 2 | 1.0 | 36.417 | 2024-02-12 18:45:18.702 | 2024-02-12 18:45:55.119 | entry-154 | entry-155 | 628 | 635 | 1115 |  | false | 0 | boundary | rtdb |
| ep-079 | doc-048 | Student 1016 | brain | 3 | tile-064 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-12 18:47:40.583 | 2024-02-12 18:47:40.583 | entry-156 | entry-157 | 840 | 866 | 1115 |  | false | 0 | control | rtdb |
| ep-080 | doc-049 | Student 1017 | brain | 3 | tile-065 | trial_and_error | 2 | 1.0 | 200.298 | 2024-02-12 18:47:02.844 | 2024-02-12 18:50:23.142 | entry-158 | entry-159 | 767 | 801 | 1223 | Demo Output Light Bulb, Live Output unset, Live Output ⚠️ connect device | false | 0 | boundary | rtdb |
| ep-081 | doc-050 | Student 1003 | brain | 3 | tile-066 | trial_and_error | 4 | 1.0 | 484.501 | 2024-02-12 18:45:01.09 | 2024-02-12 18:53:05.591 | entry-160 | entry-161 | 1259 | 1998 | 2779 |  | false | 0 | strong | rtdb |
| ep-082 | doc-051 | Student 1009 | brain | 3 | tile-067 | trial_and_error | 3 | 1.0 | 295.421 | 2024-02-12 18:46:10.793 | 2024-02-12 18:51:06.214 | entry-162 | entry-163 | 940 | 1292 | 1731 | Demo Output Light Bulb, Live Output ⚠️ connect device | false | 0 | boundary | rtdb |
| ep-083 | doc-052 | Student 1015 | brain | 3 | tile-068 | trial_and_error | 2 | 1.0 | 405.696 | 2024-02-12 18:46:24.219 | 2024-02-12 18:53:09.915 | entry-164 | entry-165 | 1801 | 1939 | 2891 |  | false | 0 | boundary | rtdb |
| ep-084 | doc-053 | Student 1021 | brain | 3 | tile-069 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-12 18:45:31.842 | 2024-02-12 18:45:31.842 | entry-166 | entry-167 | 1489 | 1518 | 2512 |  | false | 0 | control | rtdb |
| ep-085 | doc-054 | Student 1002 | brain | 3 | tile-070 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-12 18:45:13.597 | 2024-02-12 18:45:13.597 | entry-168 | entry-169 | 901 | 948 | 1694 |  | false | 0 | control | rtdb |
| ep-086 | doc-055 | Student 1013 | brain | 3 | tile-071 | trial_and_error | 3 | 1.0 | 219.908 | 2024-02-12 18:44:56.83 | 2024-02-12 18:48:36.738 | entry-170 | entry-171 | 1728 | 1814 | 2543 |  | false | 0 | boundary | rtdb |
| ep-087 | doc-056 | Student 1022 | brain | 3 | tile-072 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-12 18:45:11.004 | 2024-02-12 18:45:11.004 | entry-172 | entry-173 | 807 | 891 | 1516 |  | false | 0 | control | rtdb |
| ep-088 | doc-057 | Student 1014 | brain | 3 | tile-073 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-12 18:45:17.845 | 2024-02-12 18:45:17.845 | entry-174 | entry-175 | 1152 | 1180 | 1990 |  | false | 0 | control | rtdb |
| ep-089 | doc-058 | Student 1011 | brain | 3 | tile-074 | trial_and_error | 2 | 1.0 | 52.938 | 2024-02-12 18:45:45.677 | 2024-02-12 18:46:38.615 | entry-176 | entry-177 | 673 | 732 | 1229 |  | false | 0 | boundary | rtdb |
| ep-090 | doc-059 | Student 1023 | brain | 3 | tile-075 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-12 18:46:22.956 | 2024-02-12 18:46:22.956 | entry-178 | entry-179 | 387 | 396 | 1063 |  | false | 0 | control | rtdb |
| ep-091 | doc-060 | Student 1019 | brain | 3 | tile-076 | trial_and_error | 5 | 1.0 | 473.482 | 2024-02-12 18:45:08.402 | 2024-02-12 18:53:01.884 | entry-180 | entry-181 | 1113 | 1724 | 2607 | Demo Output Grabber | false | 0 | strong | rtdb |
| ep-092 | doc-061 | Student 1005 | brain | 3 | tile-077 | trial_and_error | 2 | 1.0 | 64.773 | 2024-02-12 18:46:17.261 | 2024-02-12 18:47:22.034 | entry-182 | entry-183 | 1006 | 1080 | 1512 |  | false | 0 | boundary | rtdb |
| ep-093 | doc-062 | Student 1007 | brain | 3 | tile-078 | trial_and_error | 3 | 1.0 | 112.593 | 2024-02-12 18:45:32.946 | 2024-02-12 18:47:25.539 | entry-184 | entry-185 | 481 | 561 | 1033 |  | false | 0 | boundary | rtdb |
| ep-094 | doc-063 | Student 1001 | brain | 3 | tile-079 | trial_and_error | 2 | 1.0 | 91.292 | 2024-02-12 18:46:46.175 | 2024-02-12 18:48:17.467 | entry-186 | entry-187 | 695 | 799 | 1035 | Live Output unset | false | 0 | boundary | rtdb |
| ep-095 | doc-064 | Student 1021 | brain | 2 | tile-080 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-13 20:44:51.841 | 2024-02-13 20:44:51.841 | entry-188 | entry-189 | 703 | 714 | 2132 |  | false | 0 | control | rtdb |
| ep-096 | doc-064 | Student 1021 | brain | 2 | tile-080 | systematic | 1 | 1.0 | 0.0 | 2024-02-14 03:05:45.339 | 2024-02-14 03:05:45.339 | entry-190 | entry-190 | 719 | 719 | 2132 |  | false | 0 | control | rtdb |
| ep-097 | doc-065 | Student 1003 | brain | 2 | tile-081 | trial_and_error | 3 | 1.0 | 210.486 | 2024-02-15 16:04:25.805 | 2024-02-15 16:07:56.291 | entry-191 | entry-192 | 555 | 618 | 2067 |  | false | 0 | boundary | rtdb |
| ep-098 | doc-065 | Student 1003 | brain | 2 | tile-081 | trial_and_error | 3 | 1.0 | 494.078 | 2024-02-15 16:09:52.313 | 2024-02-15 16:18:06.391 | entry-193 | entry-194 | 769 | 909 | 2067 |  | false | 0 | boundary | rtdb |
| ep-099 | doc-065 | Student 1003 | brain | 2 | tile-081 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-15 16:28:29.873 | 2024-02-15 16:28:29.873 | entry-195 | entry-196 | 1112 | 1120 | 2067 | Demo Output Light Bulb | false | 0 | control | rtdb |
| ep-100 | doc-066 | Student 1021 | brain | 4 | tile-082 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-16 15:47:29.995 | 2024-02-16 15:47:29.995 | entry-197 | entry-198 | 1389 | 1405 | 3297 |  | false | 0 | control | rtdb |
| ep-101 | doc-067 | Student 1020 | brain | 4 | tile-083 | systematic | 1 | 1.0 | 0.0 | 2024-02-16 15:51:49.373 | 2024-02-16 15:51:49.373 | entry-199 | entry-199 | 1041 | 1041 | 2197 |  | true | 0 | control | rtdb |
| ep-102 | doc-068 | Student 1012 | brain | 4 | tile-084 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-16 15:45:14.909 | 2024-02-16 15:45:14.909 | entry-200 | entry-201 | 603 | 604 | 1130 |  | false | 0 | control | rtdb |
| ep-103 | doc-069 | Student 1001 | brain | 4 | tile-085 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-16 15:49:51.82 | 2024-02-16 15:49:51.82 | entry-202 | entry-203 | 658 | 692 | 1384 |  | false | 0 | control | rtdb |
| ep-104 | doc-070 | Student 1017 | brain | 4 | tile-086 | trial_and_error | 2 | 1.0 | 85203.935 | 2024-02-15 16:11:41.932 | 2024-02-16 15:51:45.867 | entry-204 | entry-205 | 52 | 433 | 2696 | Demo Output Light Bulb, Live Output ⚠️ connect device | false | 0 | boundary | rtdb |
| ep-105 | doc-071 | Student 1010 | brain | 3 | tile-087 | trial_and_error | 3 | 1.0 | 265.414 | 2024-02-15 20:56:48.946 | 2024-02-15 21:01:14.36 | entry-206 | entry-207 | 658 | 1055 | 1753 |  | false | 0 | boundary | rtdb |
| ep-106 | doc-072 | Student 1006 | brain | 3 | tile-088 | trial_and_error | 4 | 1.0 | 369271.285 | 2024-02-16 19:27:06.262 | 2024-02-21 02:01:37.547 | entry-208 | entry-209 | 53 | 484 | 1323 |  | false | 0 | strong | rtdb |
| ep-107 | doc-073 | Student 1008 | brain | 5 | tile-089 | trial_and_error | 4 | 0.75 | 330.59 | 2024-02-22 15:51:58.224 | 2024-02-22 15:57:28.814 | entry-210 | entry-211 | 587 | 700 | 2895 | Live Output Simulated Gripper | true | 0 | strong | rtdb |
| ep-108 | doc-073 | Student 1008 | brain | 5 | tile-090 | trial_and_error | 2 | 1.0 | 127.559 | 2024-02-22 16:02:09.33 | 2024-02-22 16:04:16.889 | entry-212 | entry-213 | 963 | 1278 | 2895 | Live Output Simulated Gripper | true | 0 | boundary | rtdb |
| ep-109 | doc-074 | Student 1020 | brain | 5 | tile-091 | trial_and_error | 2 | 1.0 | 39.235 | 2024-02-22 15:58:49.008 | 2024-02-22 15:59:28.243 | entry-214 | entry-215 | 602 | 621 | 2398 | Live Output ⚠️ connect device | false | 0 | boundary | rtdb |
| ep-110 | doc-074 | Student 1020 | brain | 5 | tile-092 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-22 16:02:44.681 | 2024-02-22 16:02:44.681 | entry-216 | entry-217 | 630 | 652 | 2398 |  | false | 0 | control | rtdb |
| ep-111 | doc-075 | Student 1018 | brain | 5 | tile-093 | trial_and_error | 4 | 0.75 | 197.591 | 2024-02-22 16:06:48.279 | 2024-02-22 16:10:05.87 | entry-218 | entry-219 | 546 | 590 | 2606 | Live Output ⚠️ connect device | true | 0 | strong | rtdb |
| ep-112 | doc-075 | Student 1018 | brain | 5 | tile-093 | trial_and_error | 3 | 0.6666666666666666 | 202.192 | 2024-02-23 15:45:06.039 | 2024-02-23 15:48:28.231 | entry-220 | entry-221 | 1266 | 1295 | 2606 | Live Output Physical Gripper | true | 0 | boundary | rtdb |
| ep-113 | doc-075 | Student 1018 | brain | 5 | tile-094 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-22 16:05:20.881 | 2024-02-22 16:05:20.881 | entry-222 | entry-223 | 521 | 539 | 2606 |  | true | 0 | control | rtdb |
| ep-114 | doc-076 | Student 1021 | brain | 5 | tile-095 | trial_and_error | 4 | 0.75 | 453.419 | 2024-02-22 15:52:08.864 | 2024-02-22 15:59:42.283 | entry-224 | entry-225 | 437 | 527 | 1012 | Demo Output Grabber, Demo Output Light Bulb, Live Output Physical Gripper | false | 0 | strong | rtdb |
| ep-115 | doc-076 | Student 1021 | brain | 5 | tile-096 | trial_and_error | 6 | 0.8333333333333334 | 1148.012 | 2024-02-22 16:01:14.265 | 2024-02-22 16:20:22.277 | entry-226 | entry-227 | 537 | 918 | 1012 | Demo Output Light Bulb, Live Output Physical Gripper | false | 0 | strong | rtdb |
| ep-116 | doc-076 | Student 1021 | brain | 5 | tile-096 | trial_and_error | 1 | 1.0 | 0.0 | 2024-03-07 19:38:23.063 | 2024-03-07 19:38:23.063 | entry-228 | entry-229 | 974 | 976 | 1012 | Live Output Physical Gripper | false | 0 | control | rtdb |
| ep-117 | doc-077 | Student 1009 | brain | 5 | tile-097 | trial_and_error | 4 | 0.75 | 237.67 | 2024-02-22 16:03:31.51 | 2024-02-22 16:07:29.18 | entry-230 | entry-231 | 454 | 571 | 2235 | Live Output Physical Gripper | false | 0 | strong | rtdb |
| ep-118 | doc-077 | Student 1009 | brain | 5 | tile-098 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-22 15:54:17.261 | 2024-02-22 15:54:17.261 | entry-232 | entry-233 | 403 | 420 | 2235 | Live Output Physical Gripper | false | 0 | control | rtdb |
| ep-119 | doc-078 | Student 1001 | brain | 5 | tile-099 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-22 16:02:32.296 | 2024-02-22 16:02:32.296 | entry-234 | entry-235 | 383 | 400 | 2000 |  | false | 0 | control | rtdb |
| ep-120 | doc-079 | Student 1002 | brain | 5 | tile-100 | trial_and_error | 2 | 1.0 | 95.558 | 2024-02-22 15:52:24.289 | 2024-02-22 15:53:59.847 | entry-236 | entry-237 | 473 | 550 | 2752 | Live Output Physical Gripper | false | 0 | boundary | rtdb |
| ep-121 | doc-079 | Student 1002 | brain | 5 | tile-101 | trial_and_error | 2 | 1.0 | 60.798 | 2024-02-22 16:07:28.438 | 2024-02-22 16:08:29.236 | entry-238 | entry-239 | 583 | 602 | 2752 | Live Output Physical Gripper | false | 0 | boundary | rtdb |
| ep-122 | doc-080 | Student 1013 | brain | 5 | tile-102 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-22 16:19:36.414 | 2024-02-22 16:19:36.414 | entry-240 | entry-241 | 1069 | 1100 | 3092 |  | false | 0 | control | rtdb |
| ep-123 | doc-080 | Student 1013 | brain | 5 | tile-103 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-22 15:58:38.643 | 2024-02-22 15:58:38.643 | entry-242 | entry-243 | 516 | 558 | 3092 | Live Output unset | false | 0 | control | rtdb |
| ep-124 | doc-081 | Student 1003 | brain | 5 | tile-104 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-22 15:40:07.337 | 2024-02-22 15:40:07.337 | entry-244 | entry-245 | 5 | 14 | 1305 |  | false | 0 | control | rtdb |
| ep-125 | doc-081 | Student 1003 | brain | 5 | tile-105 | trial_and_error | 14 | 0.7142857142857143 | 1614.151 | 2024-02-22 15:52:29.105 | 2024-02-22 16:19:23.256 | entry-246 | entry-247 | 336 | 858 | 1305 | Live Output Physical Gripper | false | 0 | strong | rtdb |
| ep-126 | doc-081 | Student 1003 | brain | 5 | tile-105 | trial_and_error | 3 | 1.0 | 267.165 | 2024-02-23 15:54:50.696 | 2024-02-23 15:59:17.861 | entry-248 | entry-249 | 1085 | 1265 | 1305 | Live Output Physical Gripper | false | 0 | boundary | rtdb |
| ep-127 | doc-082 | Student 1015 | brain | 5 | tile-106 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-22 16:08:08.635 | 2024-02-22 16:08:08.635 | entry-250 | entry-251 | 498 | 499 | 3333 | Live Output ⚠️ connect device | false | 0 | control | rtdb |
| ep-128 | doc-083 | Student 1010 | brain | 5 | tile-107 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-22 16:09:06.273 | 2024-02-22 16:09:06.273 | entry-252 | entry-253 | 616 | 626 | 2365 |  | false | 0 | control | rtdb |
| ep-129 | doc-083 | Student 1010 | brain | 5 | tile-107 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-22 16:25:14.899 | 2024-02-22 16:25:14.899 | entry-254 | entry-255 | 975 | 985 | 2365 | Live Output Physical Gripper | false | 0 | control | rtdb |
| ep-130 | doc-084 | Student 1006 | brain | 5 | tile-108 | trial_and_error | 2 | 1.0 | 100.527 | 2024-02-22 16:05:17.614 | 2024-02-22 16:06:58.141 | entry-256 | entry-257 | 1262 | 1383 | 5674 | Live Output Simulated Gripper | true | 0 | boundary | rtdb |
| ep-131 | doc-084 | Student 1006 | brain | 5 | tile-108 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-22 16:13:22.129 | 2024-02-22 16:13:22.129 | entry-258 | entry-259 | 1425 | 1437 | 5674 | Live Output Simulated Gripper | true | 0 | control | rtdb |
| ep-132 | doc-084 | Student 1006 | brain | 5 | tile-109 | systematic | 1 | 1.0 | 0.0 | 2024-02-22 15:56:38.955 | 2024-02-22 15:56:38.955 | entry-260 | entry-260 | 900 | 900 | 5674 | Live Output Simulated Gripper | true | 0 | control | rtdb |
| ep-133 | doc-085 | Student 1019 | brain | 5 | tile-110 | trial_and_error | 4 | 0.75 | 396.218 | 2024-02-22 15:56:05.491 | 2024-02-22 16:02:41.709 | entry-261 | entry-262 | 286 | 463 | 1808 | Demo Output Advanced Grabber, Live Output ⚠️ connect device | false | 0 | strong | rtdb |
| ep-134 | doc-086 | Student 1004 | brain | 5 | tile-111 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-22 16:13:48.183 | 2024-02-22 16:13:48.183 | entry-263 | entry-264 | 602 | 626 | 2454 |  | false | 0 | control | rtdb |
| ep-135 | doc-087 | Student 1007 | brain | 5 | tile-112 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-22 16:04:35.542 | 2024-02-22 16:04:35.542 | entry-265 | entry-266 | 290 | 291 | 1181 | Live Output ⚠️ connect device | false | 0 | control | rtdb |
| ep-136 | doc-087 | Student 1007 | brain | 5 | tile-112 | trial_and_error | 4 | 0.75 | 84534.899 | 2024-02-22 16:22:15.363 | 2024-02-23 15:51:10.262 | entry-267 | entry-268 | 312 | 360 | 1181 | Live Output Physical Gripper | false | 0 | strong | rtdb |
| ep-137 | doc-088 | Student 1023 | brain | 5 | tile-113 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-22 16:05:38.236 | 2024-02-22 16:05:38.236 | entry-269 | entry-270 | 643 | 649 | 2889 |  | false | 0 | control | rtdb |
| ep-138 | doc-088 | Student 1023 | brain | 5 | tile-114 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-22 16:21:31.405 | 2024-02-22 16:21:31.405 | entry-271 | entry-272 | 663 | 669 | 2889 | Live Output ⚠️ connect device | false | 0 | control | rtdb |
| ep-139 | doc-089 | Student 1014 | brain | 5 | tile-115 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-22 15:58:51.613 | 2024-02-22 15:58:51.613 | entry-273 | entry-274 | 793 | 804 | 2038 |  | false | 0 | control | rtdb |
| ep-140 | doc-089 | Student 1014 | brain | 5 | tile-116 | trial_and_error | 3 | 1.0 | 889.198 | 2024-02-22 16:05:31.094 | 2024-02-22 16:20:20.292 | entry-275 | entry-276 | 828 | 1297 | 2038 | Live Output ⚠️ connect device | false | 0 | boundary | rtdb |
| ep-141 | doc-090 | Student 1016 | brain | 5 | tile-117 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-22 16:03:50.053 | 2024-02-22 16:03:50.053 | entry-277 | entry-278 | 295 | 314 | 1504 | Live Output ⚠️ connect device | false | 0 | control | rtdb |
| ep-142 | doc-091 | Student 1012 | brain | 5 | tile-118 | trial_and_error | 5 | 0.6 | 85831.129 | 2024-02-22 16:02:19.981 | 2024-02-23 15:52:51.11 | entry-279 | entry-280 | 437 | 525 | 1244 | Live Output Physical Gripper | true | 0 | strong | rtdb |
| ep-143 | doc-092 | Student 1005 | brain | 5 | tile-119 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-22 16:08:24.521 | 2024-02-22 16:08:24.521 | entry-281 | entry-282 | 265 | 279 | 1333 | Live Output ⚠️ connect device | false | 0 | control | rtdb |
| ep-144 | doc-093 | Student 1017 | brain | 5 | tile-120 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-22 15:58:40.682 | 2024-02-22 15:58:40.682 | entry-283 | entry-284 | 151 | 156 | 1391 |  | false | 0 | control | rtdb |
| ep-145 | doc-093 | Student 1017 | brain | 5 | tile-121 | trial_and_error | 4 | 0.75 | 465.229 | 2024-02-22 16:08:07.4 | 2024-02-22 16:15:52.629 | entry-285 | entry-286 | 194 | 306 | 1391 | Live Output ⚠️ connect device | false | 0 | strong | rtdb |
| ep-146 | doc-094 | Student 1003 | brain | 1 | tile-122 | trial_and_error | 14 | 1.0 | 3320.619 | 2024-02-26 18:03:17.891 | 2024-02-26 18:58:38.51 | entry-287 | entry-288 | 2 | 3090 | 3099 | Demo Output Advanced Grabber, Demo Output Light Bulb | false | 0 | strong | rtdb |
| ep-147 | doc-095 | Student 1009 | brain | 2 | tile-123 | trial_and_error | 2 | 1.0 | 104.679 | 2024-02-28 17:22:52.375 | 2024-02-28 17:24:37.054 | entry-289 | entry-290 | 930 | 1055 | 2807 |  | true | 2 | boundary | rtdb |
| ep-148 | doc-095 | Student 1009 | brain | 2 | tile-123 | systematic | 1 | 1.0 | 0.0 | 2024-02-28 17:25:12.332 | 2024-02-28 17:25:12.332 | entry-291 | entry-291 | 1089 | 1089 | 2807 |  | true | 0 | control | rtdb |
| ep-149 | doc-096 | Student 1012 | brain | 2 | tile-124 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-29 15:44:06.172 | 2024-02-29 15:44:06.172 | entry-292 | entry-293 | 654 | 732 | 995 |  | true | 1 | control | rtdb |
| ep-150 | doc-096 | Student 1012 | brain | 2 | tile-124 | systematic | 2 | 1.0 | 37.931 | 2024-02-29 15:47:49.772 | 2024-02-29 15:48:27.703 | entry-294 | entry-295 | 901 | 951 | 995 |  | true | 1 | boundary | rtdb |
| ep-151 | doc-097 | Student 1006 | brain | 2 | tile-125 | systematic | 3 | 1.0 | 453.86 | 2024-02-28 22:06:40.823 | 2024-02-28 22:14:14.683 | entry-296 | entry-297 | 2252 | 3714 | 4638 |  | true | 2 | boundary | rtdb |
| ep-152 | doc-098 | Student 1014 | brain | 2 | tile-126 | systematic | 2 | 1.0 | 306.813 | 2024-02-29 15:42:43.777 | 2024-02-29 15:47:50.59 | entry-298 | entry-299 | 2412 | 2853 | 2966 |  | true | 2 | boundary | rtdb |
| ep-153 | doc-099 | Student 1019 | brain | 2 | tile-127 | trial_and_error | 7 | 1.0 | 454.82 | 2024-02-29 15:42:08.048 | 2024-02-29 15:49:42.868 | entry-300 | entry-301 | 1180 | 1745 | 2298 | Demo Output Light Bulb, Live Output Simulated Gripper | true | 6 | strong | rtdb |
| ep-154 | doc-100 | Student 1013 | brain | 2 | tile-128 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-29 15:47:50.546 | 2024-02-29 15:47:50.546 | entry-302 | entry-303 | 3239 | 3281 | 3336 |  | true | 0 | control | rtdb |
| ep-155 | doc-101 | Student 1021 | brain | 2 | tile-129 | systematic | 1 | 1.0 | 0.0 | 2024-02-29 15:48:01.48 | 2024-02-29 15:48:01.48 | entry-304 | entry-304 | 1164 | 1164 | 2078 |  | true | 1 | control | rtdb |
| ep-156 | doc-102 | Student 1005 | brain | 2 | tile-130 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-29 15:40:40.17 | 2024-02-29 15:40:40.17 | entry-305 | entry-306 | 1403 | 1455 | 2335 |  | true | 1 | control | rtdb |
| ep-157 | doc-103 | Student 1015 | brain | 2 | tile-131 | trial_and_error | 4 | 1.0 | 80357.806 | 2024-02-28 17:25:37.133 | 2024-02-29 15:44:54.939 | entry-307 | entry-308 | 1323 | 3237 | 3617 |  | true | 3 | strong | rtdb |
| ep-158 | doc-103 | Student 1015 | brain | 2 | tile-131 | systematic | 1 | 1.0 | 0.0 | 2024-02-29 15:49:34.354 | 2024-02-29 15:49:34.354 | entry-309 | entry-310 | 3543 | 3548 | 3617 |  | true | 0 | control | rtdb |
| ep-159 | doc-104 | Student 1022 | brain | 2 | tile-132 | trial_and_error | 2 | 1.0 | 41.705 | 2024-02-28 17:26:48.804 | 2024-02-28 17:27:30.509 | entry-311 | entry-312 | 1296 | 1377 | 8784 |  | true | 1 | boundary | rtdb |
| ep-160 | doc-105 | Student 1016 | brain | 2 | tile-133 | systematic | 2 | 1.0 | 101.98 | 2024-02-29 15:42:49.911 | 2024-02-29 15:44:31.891 | entry-313 | entry-314 | 1271 | 1395 | 1750 |  | true | 2 | boundary | rtdb |
| ep-161 | doc-105 | Student 1016 | brain | 2 | tile-133 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-29 15:48:38.911 | 2024-02-29 15:48:38.911 | entry-315 | entry-316 | 1677 | 1687 | 1750 |  | true | 0 | control | rtdb |
| ep-162 | doc-106 | Student 1003 | brain | 2 | tile-134 | systematic | 1 | 1.0 | 0.0 | 2024-02-29 15:42:47.32 | 2024-02-29 15:42:47.32 | entry-317 | entry-317 | 1635 | 1635 | 2190 |  | true | 1 | control | rtdb |
| ep-163 | doc-106 | Student 1003 | brain | 2 | tile-134 | trial_and_error | 5 | 0.8 | 392.732 | 2024-02-29 15:43:44.663 | 2024-02-29 15:50:17.395 | entry-318 | entry-319 | 1730 | 2138 | 2190 |  | true | 4 | strong | rtdb |
| ep-164 | doc-107 | Student 1020 | brain | 2 | tile-135 | systematic | 1 | 1.0 | 0.0 | 2024-02-29 15:48:01.104 | 2024-02-29 15:48:01.104 | entry-320 | entry-320 | 599 | 599 | 678 |  | true | 1 | control | rtdb |
| ep-165 | doc-107 | Student 1020 | brain | 2 | tile-135 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-29 15:48:36.067 | 2024-02-29 15:48:36.067 | entry-321 | entry-322 | 629 | 649 | 678 |  | true | 0 | control | rtdb |
| ep-166 | doc-108 | Student 1018 | brain | 2 | tile-136 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-29 15:48:08.052 | 2024-02-29 15:48:08.052 | entry-323 | entry-324 | 956 | 970 | 1003 |  | true | 0 | control | rtdb |
| ep-167 | doc-109 | Student 1018 | brain | 3 | tile-137 | trial_and_error | 6 | 0.6666666666666666 | 84479.556 | 2024-02-29 16:15:02.243 | 2024-03-01 15:43:01.799 | entry-325 | entry-326 | 1241 | 3177 | 8714 |  | true | 5 | strong | rtdb |
| ep-168 | doc-109 | Student 1018 | brain | 3 | tile-137 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 15:44:18.231 | 2024-03-01 15:44:18.231 | entry-327 | entry-327 | 3262 | 3262 | 8714 |  | true | 1 | control | rtdb |
| ep-169 | doc-109 | Student 1018 | brain | 3 | tile-137 | trial_and_error | 2 | 1.0 | 142.296 | 2024-03-01 15:44:49.412 | 2024-03-01 15:47:11.708 | entry-328 | entry-329 | 3296 | 3502 | 8714 |  | true | 2 | boundary | rtdb |
| ep-170 | doc-109 | Student 1018 | brain | 3 | tile-137 | trial_and_error | 1 | 1.0 | 0.0 | 2024-03-01 15:53:00.101 | 2024-03-01 15:53:00.101 | entry-330 | entry-331 | 3829 | 3893 | 8714 |  | true | 1 | control | rtdb |
| ep-171 | doc-109 | Student 1018 | brain | 3 | tile-137 | trial_and_error | 6 | 1.0 | 343.554 | 2024-03-01 15:57:19.206 | 2024-03-01 16:03:02.76 | entry-332 | entry-333 | 4616 | 5543 | 8714 | Demo Output Grabber | true | 4 | strong | rtdb |
| ep-172 | doc-109 | Student 1018 | brain | 3 | tile-137 | trial_and_error | 6 | 0.8333333333333334 | 356148.604 | 2024-03-01 16:12:39.299 | 2024-03-05 19:08:27.903 | entry-334 | entry-335 | 6205 | 8651 | 8714 |  | true | 3 | strong | rtdb |
| ep-173 | doc-109 | Student 1018 | brain | 3 | tile-138 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-29 15:51:22.586 | 2024-02-29 15:51:22.586 | entry-336 | entry-337 | 7 | 24 | 8714 |  | true | 0 | control | rtdb |
| ep-174 | doc-109 | Student 1018 | brain | 3 | tile-138 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-29 16:01:11.896 | 2024-02-29 16:01:11.896 | entry-338 | entry-339 | 465 | 470 | 8714 |  | true | 0 | control | rtdb |
| ep-175 | doc-109 | Student 1018 | brain | 3 | tile-139 | trial_and_error | 6 | 1.0 | 313.54 | 2024-02-29 16:02:17.835 | 2024-02-29 16:07:31.375 | entry-340 | entry-341 | 474 | 659 | 8714 |  | true | 0 | strong | rtdb |
| ep-176 | doc-110 | Student 1004 | brain | 3 | tile-140 | systematic | 1 | 1.0 | 0.0 | 2024-02-29 16:15:03.368 | 2024-02-29 16:15:03.368 | entry-342 | entry-343 | 1217 | 1264 | 7206 |  | true | 1 | control | rtdb |
| ep-177 | doc-110 | Student 1004 | brain | 3 | tile-140 | trial_and_error | 2 | 1.0 | 80.579 | 2024-02-29 16:15:54.856 | 2024-02-29 16:17:15.435 | entry-344 | entry-345 | 1311 | 1463 | 7206 |  | true | 2 | boundary | rtdb |
| ep-178 | doc-110 | Student 1004 | brain | 3 | tile-140 | systematic | 1 | 1.0 | 0.0 | 2024-02-29 16:19:57.445 | 2024-02-29 16:19:57.445 | entry-346 | entry-346 | 1646 | 1646 | 7206 |  | true | 1 | control | rtdb |
| ep-179 | doc-110 | Student 1004 | brain | 3 | tile-140 | trial_and_error | 11 | 0.8181818181818182 | 84638.352 | 2024-02-29 16:21:01.685 | 2024-03-01 15:51:40.037 | entry-347 | entry-348 | 1718 | 3754 | 7206 |  | true | 10 | strong | rtdb |
| ep-180 | doc-110 | Student 1004 | brain | 3 | tile-140 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 15:52:53.692 | 2024-03-01 15:52:53.692 | entry-349 | entry-349 | 3790 | 3790 | 7206 |  | true | 1 | control | rtdb |
| ep-181 | doc-110 | Student 1004 | brain | 3 | tile-140 | trial_and_error | 6 | 1.0 | 596.398 | 2024-03-01 15:56:39.841 | 2024-03-01 16:06:36.239 | entry-350 | entry-351 | 3968 | 4511 | 7206 |  | true | 6 | strong | rtdb |
| ep-182 | doc-110 | Student 1004 | brain | 3 | tile-140 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 16:08:53.086 | 2024-03-01 16:08:53.086 | entry-352 | entry-352 | 4558 | 4558 | 7206 |  | true | 1 | control | rtdb |
| ep-183 | doc-110 | Student 1004 | brain | 3 | tile-140 | trial_and_error | 1 | 1.0 | 0.0 | 2024-03-01 16:10:08.873 | 2024-03-01 16:10:08.873 | entry-353 | entry-354 | 4608 | 4627 | 7206 |  | true | 1 | control | rtdb |
| ep-184 | doc-110 | Student 1004 | brain | 3 | tile-140 | trial_and_error | 1 | 1.0 | 0.0 | 2024-03-01 16:23:14.477 | 2024-03-01 16:23:14.477 | entry-355 | entry-356 | 5032 | 5040 | 7206 |  | true | 1 | control | rtdb |
| ep-185 | doc-110 | Student 1004 | brain | 3 | tile-140 | trial_and_error | 2 | 1.0 | 63.799 | 2024-03-01 16:43:55.878 | 2024-03-01 16:44:59.677 | entry-357 | entry-358 | 5513 | 5541 | 7206 |  | true | 2 | boundary | rtdb |
| ep-186 | doc-110 | Student 1004 | brain | 3 | tile-140 | trial_and_error | 3 | 0.6666666666666666 | 155.382 | 2024-03-01 16:55:19.939 | 2024-03-01 16:57:55.321 | entry-359 | entry-360 | 5671 | 5732 | 7206 |  | true | 3 | boundary | rtdb |
| ep-187 | doc-110 | Student 1004 | brain | 3 | tile-140 | systematic | 2 | 1.0 | 48.177 | 2024-03-01 17:03:07.361 | 2024-03-01 17:03:55.538 | entry-361 | entry-362 | 5788 | 5803 | 7206 |  | true | 1 | boundary | rtdb |
| ep-188 | doc-110 | Student 1004 | brain | 3 | tile-140 | trial_and_error | 2 | 1.0 | 120.78 | 2024-03-01 17:14:34.054 | 2024-03-01 17:16:34.834 | entry-363 | entry-364 | 5859 | 5900 | 7206 |  | true | 1 | boundary | rtdb |
| ep-189 | doc-110 | Student 1004 | brain | 3 | tile-140 | trial_and_error | 5 | 0.8 | 786.237 | 2024-03-04 18:19:35.264 | 2024-03-04 18:32:41.501 | entry-365 | entry-366 | 6018 | 6101 | 7206 |  | true | 2 | strong | rtdb |
| ep-190 | doc-110 | Student 1004 | brain | 3 | tile-140 | trial_and_error | 6 | 0.8333333333333334 | 180829.931 | 2024-03-05 17:04:08.744 | 2024-03-07 19:17:58.675 | entry-367 | entry-368 | 6333 | 7034 | 7206 | Demo Output Grabber, Demo Output Light Bulb, Live Output Simulated Gripper | true | 5 | strong | rtdb |
| ep-191 | doc-110 | Student 1004 | brain | 3 | tile-140 | systematic | 3 | 1.0 | 105.007 | 2024-03-07 19:18:54.443 | 2024-03-07 19:20:39.45 | entry-369 | entry-370 | 7046 | 7094 | 7206 | Live Output Simulated Gripper | true | 3 | boundary | rtdb |
| ep-192 | doc-110 | Student 1004 | brain | 3 | tile-140 | trial_and_error | 1 | 1.0 | 0.0 | 2024-03-07 19:21:29.214 | 2024-03-07 19:21:29.214 | entry-371 | entry-372 | 7114 | 7120 | 7206 | Live Output Simulated Gripper | true | 0 | control | rtdb |
| ep-193 | doc-110 | Student 1004 | brain | 3 | tile-141 | systematic | 1 | 1.0 | 0.0 | 2024-02-29 15:53:19.272 | 2024-02-29 15:53:19.272 | entry-373 | entry-373 | 59 | 59 | 7206 |  | true | 0 | control | rtdb |
| ep-194 | doc-110 | Student 1004 | brain | 3 | tile-141 | trial_and_error | 3 | 1.0 | 530964.852 | 2024-03-01 15:36:52.628 | 2024-03-07 19:06:17.48 | entry-374 | entry-375 | 2335 | 6544 | 7206 | Demo Output Grabber | true | 0 | boundary | rtdb |
| ep-195 | doc-110 | Student 1004 | brain | 3 | tile-142 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-29 16:02:41.151 | 2024-02-29 16:02:41.151 | entry-376 | entry-377 | 376 | 457 | 7206 |  | true | 0 | control | rtdb |
| ep-196 | doc-111 | Student 1008 | brain | 3 | tile-143 | trial_and_error | 6 | 1.0 | 84816.921 | 2024-02-29 16:02:31.558 | 2024-03-01 15:36:08.479 | entry-378 | entry-379 | 397 | 2358 | 9353 |  | true | 0 | strong | rtdb |
| ep-197 | doc-111 | Student 1008 | brain | 3 | tile-144 | trial_and_error | 3 | 1.0 | 356.498 | 2024-02-29 15:51:37.169 | 2024-02-29 15:57:33.667 | entry-380 | entry-381 | 12 | 388 | 9353 | Demo Output Grabber, Demo Output Light Bulb, Live Output ⚠️ connect device | true | 0 | boundary | rtdb |
| ep-198 | doc-111 | Student 1008 | brain | 3 | tile-145 | systematic | 1 | 1.0 | 0.0 | 2024-02-29 16:12:34.024 | 2024-02-29 16:12:34.024 | entry-382 | entry-382 | 915 | 915 | 9353 |  | true | 1 | control | rtdb |
| ep-199 | doc-111 | Student 1008 | brain | 3 | tile-145 | trial_and_error | 16 | 0.9375 | 84792.026 | 2024-02-29 16:15:00.113 | 2024-03-01 15:48:12.139 | entry-383 | entry-384 | 1111 | 3829 | 9353 |  | true | 14 | strong | rtdb |
| ep-200 | doc-111 | Student 1008 | brain | 3 | tile-145 | trial_and_error | 4 | 1.0 | 216.343 | 2024-03-01 15:52:28.107 | 2024-03-01 15:56:04.45 | entry-385 | entry-386 | 3983 | 4268 | 9353 |  | true | 4 | strong | rtdb |
| ep-201 | doc-111 | Student 1008 | brain | 3 | tile-145 | trial_and_error | 12 | 0.9166666666666666 | 290146.616 | 2024-03-01 16:05:47.593 | 2024-03-05 00:41:34.209 | entry-387 | entry-388 | 4581 | 6526 | 9353 |  | true | 9 | strong | rtdb |
| ep-202 | doc-111 | Student 1008 | brain | 3 | tile-145 | trial_and_error | 3 | 1.0 | 117.886 | 2024-03-05 19:13:29.727 | 2024-03-05 19:15:27.613 | entry-389 | entry-390 | 8863 | 8941 | 9353 |  | true | 3 | boundary | rtdb |
| ep-203 | doc-111 | Student 1008 | brain | 3 | tile-145 | systematic | 1 | 1.0 | 0.0 | 2024-03-05 19:17:19.71 | 2024-03-05 19:17:19.71 | entry-391 | entry-392 | 8981 | 8988 | 9353 |  | true | 0 | control | rtdb |
| ep-204 | doc-112 | Student 1005 | brain | 3 | tile-146 | trial_and_error | 5 | 1.0 | 421.728 | 2024-02-29 16:01:55.347 | 2024-02-29 16:08:57.075 | entry-393 | entry-394 | 196 | 517 | 4735 |  | true | 0 | strong | rtdb |
| ep-205 | doc-112 | Student 1005 | brain | 3 | tile-147 | trial_and_error | 2 | 1.0 | 126.695 | 2024-02-29 16:15:09.986 | 2024-02-29 16:17:16.681 | entry-395 | entry-396 | 832 | 984 | 4735 |  | true | 2 | boundary | rtdb |
| ep-206 | doc-112 | Student 1005 | brain | 3 | tile-147 | trial_and_error | 2 | 1.0 | 84.62 | 2024-03-01 15:43:27.457 | 2024-03-01 15:44:52.077 | entry-397 | entry-398 | 1881 | 2174 | 4735 |  | true | 2 | boundary | rtdb |
| ep-207 | doc-112 | Student 1005 | brain | 3 | tile-147 | systematic | 2 | 1.0 | 91.532 | 2024-03-01 15:48:41.616 | 2024-03-01 15:50:13.148 | entry-399 | entry-400 | 2372 | 2469 | 4735 |  | true | 2 | boundary | rtdb |
| ep-208 | doc-112 | Student 1005 | brain | 3 | tile-147 | trial_and_error | 1 | 1.0 | 0.0 | 2024-03-01 15:53:39.556 | 2024-03-01 15:53:39.556 | entry-401 | entry-402 | 2660 | 2667 | 4735 |  | true | 1 | control | rtdb |
| ep-209 | doc-112 | Student 1005 | brain | 3 | tile-147 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 15:54:23.5 | 2024-03-01 15:54:23.5 | entry-403 | entry-403 | 2697 | 2697 | 4735 |  | true | 1 | control | rtdb |
| ep-210 | doc-112 | Student 1005 | brain | 3 | tile-147 | trial_and_error | 3 | 0.6666666666666666 | 351.826 | 2024-03-01 15:57:33.42 | 2024-03-01 16:03:25.246 | entry-404 | entry-405 | 2842 | 3101 | 4735 |  | true | 3 | boundary | rtdb |
| ep-211 | doc-112 | Student 1005 | brain | 3 | tile-147 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 16:05:37.044 | 2024-03-01 16:05:37.044 | entry-406 | entry-406 | 3205 | 3205 | 4735 |  | true | 1 | control | rtdb |
| ep-212 | doc-112 | Student 1005 | brain | 3 | tile-147 | trial_and_error | 1 | 1.0 | 0.0 | 2024-03-01 16:08:39.311 | 2024-03-01 16:08:39.311 | entry-407 | entry-408 | 3452 | 3469 | 4735 |  | true | 1 | control | rtdb |
| ep-213 | doc-112 | Student 1005 | brain | 3 | tile-147 | systematic | 3 | 1.0 | 204.828 | 2024-03-01 16:11:39.984 | 2024-03-01 16:15:04.812 | entry-409 | entry-410 | 3591 | 3705 | 4735 |  | true | 2 | boundary | rtdb |
| ep-214 | doc-112 | Student 1005 | brain | 3 | tile-147 | trial_and_error | 1 | 1.0 | 0.0 | 2024-03-07 19:04:37.546 | 2024-03-07 19:04:37.546 | entry-411 | entry-412 | 4154 | 4176 | 4735 |  | true | 1 | control | rtdb |
| ep-215 | doc-112 | Student 1005 | brain | 3 | tile-147 | trial_and_error | 3 | 1.0 | 167.711 | 2024-03-07 19:10:25.491 | 2024-03-07 19:13:13.202 | entry-413 | entry-414 | 4485 | 4622 | 4735 |  | true | 3 | boundary | rtdb |
| ep-216 | doc-112 | Student 1005 | brain | 3 | tile-147 | systematic | 1 | 1.0 | 0.0 | 2024-03-07 19:16:39.876 | 2024-03-07 19:16:39.876 | entry-415 | entry-415 | 4713 | 4713 | 4735 |  | true | 0 | control | rtdb |
| ep-217 | doc-113 | Student 1015 | brain | 3 | tile-148 | trial_and_error | 4 | 1.0 | 355963.609 | 2024-02-29 16:04:21.11 | 2024-03-04 18:57:04.719 | entry-416 | entry-417 | 481 | 2195 | 4442 |  | true | 0 | strong | rtdb |
| ep-218 | doc-113 | Student 1015 | brain | 3 | tile-149 | systematic | 1 | 1.0 | 0.0 | 2024-02-29 16:12:54.124 | 2024-02-29 16:12:54.124 | entry-418 | entry-418 | 1038 | 1038 | 4442 |  | true | 1 | control | rtdb |
| ep-219 | doc-113 | Student 1015 | brain | 3 | tile-149 | trial_and_error | 2 | 1.0 | 123.018 | 2024-02-29 16:17:13.603 | 2024-02-29 16:19:16.621 | entry-419 | entry-420 | 1331 | 1488 | 4442 |  | true | 2 | boundary | rtdb |
| ep-220 | doc-113 | Student 1015 | brain | 3 | tile-149 | systematic | 1 | 1.0 | 0.0 | 2024-02-29 16:22:36.45 | 2024-02-29 16:22:36.45 | entry-421 | entry-421 | 1666 | 1666 | 4442 |  | true | 1 | control | rtdb |
| ep-221 | doc-113 | Student 1015 | brain | 3 | tile-149 | trial_and_error | 5 | 1.0 | 442128.283 | 2024-02-29 16:24:59.34 | 2024-03-05 19:13:47.623 | entry-422 | entry-423 | 1815 | 3517 | 4442 |  | true | 4 | strong | rtdb |
| ep-222 | doc-113 | Student 1015 | brain | 3 | tile-149 | systematic | 1 | 1.0 | 0.0 | 2024-03-05 19:14:22.169 | 2024-03-05 19:14:22.169 | entry-424 | entry-425 | 3529 | 3545 | 4442 |  | true | 1 | control | rtdb |
| ep-223 | doc-113 | Student 1015 | brain | 3 | tile-149 | trial_and_error | 1 | 1.0 | 0.0 | 2024-03-05 19:17:50.144 | 2024-03-05 19:17:50.144 | entry-426 | entry-427 | 3632 | 3655 | 4442 |  | true | 1 | control | rtdb |
| ep-224 | doc-113 | Student 1015 | brain | 3 | tile-149 | systematic | 1 | 1.0 | 0.0 | 2024-03-05 19:18:59.102 | 2024-03-05 19:18:59.102 | entry-428 | entry-428 | 3668 | 3668 | 4442 |  | true | 1 | control | rtdb |
| ep-225 | doc-113 | Student 1015 | brain | 3 | tile-149 | trial_and_error | 1 | 1.0 | 0.0 | 2024-03-05 19:26:08.966 | 2024-03-05 19:26:08.966 | entry-429 | entry-430 | 3952 | 3964 | 4442 |  | true | 1 | control | rtdb |
| ep-226 | doc-113 | Student 1015 | brain | 3 | tile-149 | systematic | 2 | 1.0 | 25.676 | 2024-03-05 19:26:44.591 | 2024-03-05 19:27:10.267 | entry-431 | entry-432 | 3992 | 4011 | 4442 |  | true | 2 | boundary | rtdb |
| ep-227 | doc-113 | Student 1015 | brain | 3 | tile-149 | trial_and_error | 4 | 1.0 | 185.767 | 2024-03-05 19:28:05.674 | 2024-03-05 19:31:11.441 | entry-433 | entry-434 | 4061 | 4209 | 4442 |  | true | 4 | strong | rtdb |
| ep-228 | doc-113 | Student 1015 | brain | 3 | tile-149 | systematic | 2 | 1.0 | 38.403 | 2024-03-05 19:32:14.724 | 2024-03-05 19:32:53.127 | entry-435 | entry-436 | 4224 | 4247 | 4442 |  | true | 2 | boundary | rtdb |
| ep-229 | doc-113 | Student 1015 | brain | 3 | tile-149 | trial_and_error | 2 | 1.0 | 92.483 | 2024-03-05 19:33:33.069 | 2024-03-05 19:35:05.552 | entry-437 | entry-438 | 4266 | 4336 | 4442 |  | true | 2 | boundary | rtdb |
| ep-230 | doc-113 | Student 1015 | brain | 3 | tile-149 | systematic | 1 | 1.0 | 0.0 | 2024-03-05 19:36:54.183 | 2024-03-05 19:36:54.183 | entry-439 | entry-439 | 4369 | 4369 | 4442 |  | true | 1 | control | rtdb |
| ep-231 | doc-113 | Student 1015 | brain | 3 | tile-149 | trial_and_error | 1 | 1.0 | 0.0 | 2024-03-05 19:37:40.587 | 2024-03-05 19:37:40.587 | entry-440 | entry-441 | 4395 | 4413 | 4442 |  | true | 0 | control | rtdb |
| ep-232 | doc-113 | Student 1015 | brain | 3 | tile-150 | trial_and_error | 2 | 1.0 | 40.021 | 2024-02-29 15:54:49.422 | 2024-02-29 15:55:29.443 | entry-442 | entry-443 | 97 | 108 | 4442 |  | true | 0 | boundary | rtdb |
| ep-233 | doc-114 | Student 1009 | brain | 3 | tile-151 | trial_and_error | 4 | 0.75 | 505.801 | 2024-02-29 16:15:00.316 | 2024-02-29 16:23:26.117 | entry-444 | entry-445 | 1761 | 2495 | 4231 |  | true | 4 | strong | rtdb |
| ep-234 | doc-114 | Student 1009 | brain | 3 | tile-152 | trial_and_error | 4 | 1.0 | 444251.476 | 2024-02-29 16:02:46.484 | 2024-03-05 19:26:57.96 | entry-446 | entry-447 | 559 | 3375 | 4231 |  | true | 0 | strong | rtdb |
| ep-235 | doc-114 | Student 1009 | brain | 3 | tile-153 | trial_and_error | 6 | 1.0 | 444115.568 | 2024-02-29 15:57:02.425 | 2024-03-05 19:18:57.993 | entry-448 | entry-449 | 408 | 3228 | 4231 | Demo Output Grabber, Live Output Simulated Gripper, Live Output unset | true | 4 | strong | rtdb |
| ep-236 | doc-114 | Student 1009 | brain | 3 | tile-153 | trial_and_error | 2 | 1.0 | 130.507 | 2024-03-05 19:27:11.795 | 2024-03-05 19:29:22.302 | entry-450 | entry-451 | 3379 | 3489 | 4231 | Live Output Simulated Gripper | true | 2 | boundary | rtdb |
| ep-237 | doc-114 | Student 1009 | brain | 3 | tile-153 | systematic | 2 | 1.0 | 33.577 | 2024-03-05 19:29:51.019 | 2024-03-05 19:30:24.596 | entry-452 | entry-453 | 3543 | 3597 | 4231 | Live Output Simulated Gripper | true | 1 | boundary | rtdb |
| ep-238 | doc-115 | Student 1013 | brain | 3 | tile-154 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-29 16:01:47.172 | 2024-02-29 16:01:47.172 | entry-454 | entry-455 | 466 | 467 | 5002 |  | true | 0 | control | rtdb |
| ep-239 | doc-115 | Student 1013 | brain | 3 | tile-155 | trial_and_error | 4 | 1.0 | 403.514 | 2024-02-29 16:02:42.334 | 2024-02-29 16:09:25.848 | entry-456 | entry-457 | 489 | 748 | 5002 |  | true | 0 | strong | rtdb |
| ep-240 | doc-115 | Student 1013 | brain | 3 | tile-156 | trial_and_error | 3 | 1.0 | 206.074 | 2024-02-29 16:15:01.166 | 2024-02-29 16:18:27.24 | entry-458 | entry-459 | 1176 | 1578 | 5002 |  | true | 3 | boundary | rtdb |
| ep-241 | doc-115 | Student 1013 | brain | 3 | tile-156 | trial_and_error | 1 | 1.0 | 0.0 | 2024-03-01 15:44:22.682 | 2024-03-01 15:44:22.682 | entry-460 | entry-461 | 3759 | 3939 | 5002 |  | true | 1 | control | rtdb |
| ep-242 | doc-115 | Student 1013 | brain | 3 | tile-156 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 15:46:29.24 | 2024-03-01 15:46:29.24 | entry-462 | entry-462 | 4003 | 4003 | 5002 |  | true | 1 | control | rtdb |
| ep-243 | doc-115 | Student 1013 | brain | 3 | tile-156 | trial_and_error | 2 | 1.0 | 286.73 | 2024-03-01 15:48:39.924 | 2024-03-01 15:53:26.654 | entry-463 | entry-464 | 4173 | 4413 | 5002 |  | true | 1 | boundary | rtdb |
| ep-244 | doc-116 | Student 1014 | brain | 3 | tile-157 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-29 15:52:15.394 | 2024-02-29 15:52:15.394 | entry-465 | entry-466 | 70 | 90 | 6496 |  | true | 0 | control | rtdb |
| ep-245 | doc-116 | Student 1014 | brain | 3 | tile-158 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-29 16:14:57.303 | 2024-02-29 16:14:57.303 | entry-467 | entry-468 | 1111 | 1141 | 6496 |  | true | 1 | control | rtdb |
| ep-246 | doc-116 | Student 1014 | brain | 3 | tile-158 | systematic | 1 | 1.0 | 0.0 | 2024-02-29 16:15:41.886 | 2024-02-29 16:15:41.886 | entry-469 | entry-469 | 1191 | 1191 | 6496 |  | true | 1 | control | rtdb |
| ep-247 | doc-116 | Student 1014 | brain | 3 | tile-158 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-29 16:17:12.495 | 2024-02-29 16:17:12.495 | entry-470 | entry-471 | 1352 | 1381 | 6496 |  | true | 1 | control | rtdb |
| ep-248 | doc-116 | Student 1014 | brain | 3 | tile-158 | trial_and_error | 2 | 1.0 | 29.665 | 2024-03-01 15:43:00.964 | 2024-03-01 15:43:30.629 | entry-472 | entry-473 | 3317 | 3412 | 6496 |  | true | 2 | boundary | rtdb |
| ep-249 | doc-116 | Student 1014 | brain | 3 | tile-158 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 15:44:57.857 | 2024-03-01 15:44:57.857 | entry-474 | entry-475 | 3590 | 3642 | 6496 |  | true | 1 | control | rtdb |
| ep-250 | doc-116 | Student 1014 | brain | 3 | tile-158 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 15:49:04.265 | 2024-03-01 15:49:04.265 | entry-476 | entry-476 | 4095 | 4095 | 6496 |  | true | 1 | control | rtdb |
| ep-251 | doc-116 | Student 1014 | brain | 3 | tile-158 | trial_and_error | 6 | 0.8333333333333334 | 554.785 | 2024-03-01 15:49:33.859 | 2024-03-01 15:58:48.644 | entry-477 | entry-478 | 4138 | 4931 | 6496 | Demo Output Light Bulb | true | 6 | strong | rtdb |
| ep-252 | doc-116 | Student 1014 | brain | 3 | tile-158 | trial_and_error | 2 | 1.0 | 117.522 | 2024-03-01 16:05:14.301 | 2024-03-01 16:07:11.823 | entry-479 | entry-480 | 5301 | 5447 | 6496 |  | true | 2 | boundary | rtdb |
| ep-253 | doc-116 | Student 1014 | brain | 3 | tile-158 | systematic | 2 | 1.0 | 29.071 | 2024-03-01 16:14:39.842 | 2024-03-01 16:15:08.913 | entry-481 | entry-482 | 5737 | 5754 | 6496 |  | true | 2 | boundary | rtdb |
| ep-254 | doc-116 | Student 1014 | brain | 3 | tile-158 | trial_and_error | 2 | 1.0 | 183.303 | 2024-03-01 16:15:55.842 | 2024-03-01 16:18:59.145 | entry-483 | entry-484 | 5795 | 5928 | 6496 |  | true | 2 | boundary | rtdb |
| ep-255 | doc-116 | Student 1014 | brain | 3 | tile-159 | trial_and_error | 5 | 1.0 | 179.248 | 2024-02-29 16:03:02.13 | 2024-02-29 16:06:01.378 | entry-485 | entry-486 | 427 | 570 | 6496 |  | true | 0 | strong | rtdb |
| ep-256 | doc-117 | Student 1022 | brain | 3 | tile-160 | trial_and_error | 6 | 1.0 | 358375.291 | 2024-03-01 16:16:43.542 | 2024-03-05 19:49:38.833 | entry-487 | entry-488 | 6140 | 7164 | 9793 |  | true | 5 | strong | rtdb |
| ep-257 | doc-117 | Student 1022 | brain | 3 | tile-160 | systematic | 1 | 1.0 | 0.0 | 2024-03-05 19:53:22.715 | 2024-03-05 19:53:22.715 | entry-489 | entry-490 | 7235 | 7239 | 9793 | Live Output Simulated Gripper | true | 1 | control | rtdb |
| ep-258 | doc-117 | Student 1022 | brain | 3 | tile-160 | trial_and_error | 2 | 1.0 | 108.621 | 2024-03-05 19:58:30.067 | 2024-03-05 20:00:18.688 | entry-491 | entry-492 | 7319 | 7406 | 9793 | Live Output Simulated Gripper | true | 1 | boundary | rtdb |
| ep-259 | doc-117 | Student 1022 | brain | 3 | tile-161 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-29 16:00:41.195 | 2024-02-29 16:00:41.195 | entry-493 | entry-494 | 184 | 191 | 9793 |  | true | 0 | control | rtdb |
| ep-260 | doc-117 | Student 1022 | brain | 3 | tile-162 | trial_and_error | 2 | 1.0 | 126.679 | 2024-02-29 16:15:01.976 | 2024-02-29 16:17:08.655 | entry-495 | entry-496 | 717 | 997 | 9793 |  | true | 2 | boundary | rtdb |
| ep-261 | doc-117 | Student 1022 | brain | 3 | tile-162 | trial_and_error | 2 | 1.0 | 68.975 | 2024-03-01 15:42:43.259 | 2024-03-01 15:43:52.234 | entry-497 | entry-498 | 2881 | 3028 | 9793 |  | true | 2 | boundary | rtdb |
| ep-262 | doc-117 | Student 1022 | brain | 3 | tile-162 | trial_and_error | 1 | 1.0 | 0.0 | 2024-03-01 15:59:02.158 | 2024-03-01 15:59:02.158 | entry-499 | entry-500 | 4459 | 4510 | 9793 |  | true | 1 | control | rtdb |
| ep-263 | doc-117 | Student 1022 | brain | 3 | tile-162 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 16:04:38.472 | 2024-03-01 16:04:38.472 | entry-501 | entry-501 | 5142 | 5142 | 9793 |  | true | 0 | control | rtdb |
| ep-264 | doc-117 | Student 1022 | brain | 3 | tile-163 | trial_and_error | 3 | 1.0 | 125.178 | 2024-02-29 16:02:21.034 | 2024-02-29 16:04:26.212 | entry-502 | entry-503 | 196 | 237 | 9793 |  | true | 0 | boundary | rtdb |
| ep-265 | doc-118 | Student 1020 | brain | 3 | tile-164 | trial_and_error | 6 | 1.0 | 84612.822 | 2024-02-29 16:02:47.031 | 2024-03-01 15:32:59.853 | entry-504 | entry-505 | 331 | 2025 | 6186 |  | true | 0 | strong | rtdb |
| ep-266 | doc-118 | Student 1020 | brain | 3 | tile-165 | trial_and_error | 3 | 1.0 | 187.367 | 2024-02-29 16:15:20.909 | 2024-02-29 16:18:28.276 | entry-506 | entry-507 | 1129 | 1586 | 6186 |  | true | 3 | boundary | rtdb |
| ep-267 | doc-118 | Student 1020 | brain | 3 | tile-165 | trial_and_error | 2 | 1.0 | 52.318 | 2024-03-01 15:43:21.137 | 2024-03-01 15:44:13.455 | entry-508 | entry-509 | 3672 | 3745 | 6186 |  | true | 2 | boundary | rtdb |
| ep-268 | doc-118 | Student 1020 | brain | 3 | tile-165 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 15:46:44.683 | 2024-03-01 15:46:44.683 | entry-510 | entry-510 | 3882 | 3882 | 6186 |  | true | 1 | control | rtdb |
| ep-269 | doc-118 | Student 1020 | brain | 3 | tile-165 | trial_and_error | 2 | 1.0 | 71.733 | 2024-03-01 15:48:54.286 | 2024-03-01 15:50:06.019 | entry-511 | entry-512 | 3955 | 4042 | 6186 |  | true | 2 | boundary | rtdb |
| ep-270 | doc-118 | Student 1020 | brain | 3 | tile-165 | systematic | 3 | 1.0 | 108.997 | 2024-03-01 15:52:23.001 | 2024-03-01 15:54:11.998 | entry-513 | entry-514 | 4239 | 4394 | 6186 |  | true | 3 | boundary | rtdb |
| ep-271 | doc-118 | Student 1020 | brain | 3 | tile-165 | trial_and_error | 7 | 1.0 | 1247.402 | 2024-03-01 15:56:54.165 | 2024-03-01 16:17:41.567 | entry-515 | entry-516 | 4590 | 5396 | 6186 |  | true | 6 | strong | rtdb |
| ep-272 | doc-118 | Student 1020 | brain | 3 | tile-165 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 16:18:58.405 | 2024-03-01 16:18:58.405 | entry-517 | entry-517 | 5431 | 5431 | 6186 |  | true | 1 | control | rtdb |
| ep-273 | doc-118 | Student 1020 | brain | 3 | tile-165 | trial_and_error | 1 | 1.0 | 0.0 | 2024-03-01 16:30:37.752 | 2024-03-01 16:30:37.752 | entry-518 | entry-519 | 5896 | 5916 | 6186 |  | true | 0 | control | rtdb |
| ep-274 | doc-119 | Student 1012 | brain | 3 | tile-166 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-29 15:51:35.458 | 2024-02-29 15:51:35.458 | entry-520 | entry-521 | 6 | 27 | 6155 |  | true | 0 | control | rtdb |
| ep-275 | doc-119 | Student 1012 | brain | 3 | tile-166 | systematic | 1 | 1.0 | 0.0 | 2024-02-29 15:53:42.916 | 2024-02-29 15:53:42.916 | entry-522 | entry-522 | 38 | 38 | 6155 |  | true | 0 | control | rtdb |
| ep-276 | doc-119 | Student 1012 | brain | 3 | tile-166 | trial_and_error | 4 | 1.0 | 681.503 | 2024-02-29 15:57:24.102 | 2024-02-29 16:08:45.605 | entry-523 | entry-524 | 260 | 1041 | 6155 | Demo Output Grabber | true | 0 | strong | rtdb |
| ep-277 | doc-119 | Student 1012 | brain | 3 | tile-167 | systematic | 2 | 1.0 | 33.365 | 2024-02-29 16:14:38.436 | 2024-02-29 16:15:11.801 | entry-525 | entry-526 | 1344 | 1437 | 6155 |  | true | 2 | boundary | rtdb |
| ep-278 | doc-119 | Student 1012 | brain | 3 | tile-167 | trial_and_error | 3 | 1.0 | 531.649 | 2024-02-29 16:15:39.915 | 2024-02-29 16:24:31.564 | entry-527 | entry-528 | 1515 | 2557 | 6155 |  | true | 3 | boundary | rtdb |
| ep-279 | doc-119 | Student 1012 | brain | 3 | tile-167 | trial_and_error | 2 | 1.0 | 50.062 | 2024-03-01 15:42:12.023 | 2024-03-01 15:43:02.085 | entry-529 | entry-530 | 3523 | 3663 | 6155 |  | true | 2 | boundary | rtdb |
| ep-280 | doc-119 | Student 1012 | brain | 3 | tile-167 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 15:44:04.592 | 2024-03-01 15:44:04.592 | entry-531 | entry-531 | 3753 | 3753 | 6155 |  | true | 1 | control | rtdb |
| ep-281 | doc-119 | Student 1012 | brain | 3 | tile-167 | trial_and_error | 1 | 1.0 | 0.0 | 2024-03-01 15:44:49.88 | 2024-03-01 15:44:49.88 | entry-532 | entry-533 | 3837 | 3926 | 6155 |  | true | 1 | control | rtdb |
| ep-282 | doc-119 | Student 1012 | brain | 3 | tile-167 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 15:45:56.708 | 2024-03-01 15:45:56.708 | entry-534 | entry-534 | 3966 | 3966 | 6155 |  | true | 1 | control | rtdb |
| ep-283 | doc-119 | Student 1012 | brain | 3 | tile-167 | trial_and_error | 2 | 1.0 | 132.525 | 2024-03-01 15:46:27.998 | 2024-03-01 15:48:40.523 | entry-535 | entry-536 | 4033 | 4293 | 6155 |  | true | 2 | boundary | rtdb |
| ep-284 | doc-119 | Student 1012 | brain | 3 | tile-167 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 15:54:27.921 | 2024-03-01 15:54:27.921 | entry-537 | entry-537 | 4699 | 4699 | 6155 |  | true | 1 | control | rtdb |
| ep-285 | doc-119 | Student 1012 | brain | 3 | tile-167 | trial_and_error | 6 | 1.0 | 966.139 | 2024-03-01 16:01:42.331 | 2024-03-01 16:17:48.47 | entry-538 | entry-539 | 5084 | 5831 | 6155 |  | true | 6 | strong | rtdb |
| ep-286 | doc-119 | Student 1012 | brain | 3 | tile-167 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 16:18:56.467 | 2024-03-01 16:18:56.467 | entry-540 | entry-541 | 5861 | 5873 | 6155 |  | true | 1 | control | rtdb |
| ep-287 | doc-119 | Student 1012 | brain | 3 | tile-167 | trial_and_error | 1 | 1.0 | 0.0 | 2024-03-01 16:25:53.3 | 2024-03-01 16:25:53.3 | entry-542 | entry-543 | 6082 | 6101 | 6155 |  | true | 1 | control | rtdb |
| ep-288 | doc-120 | Student 1019 | brain | 3 | tile-168 | trial_and_error | 4 | 0.75 | 372.731 | 2024-02-29 16:12:31.221 | 2024-02-29 16:18:43.952 | entry-544 | entry-545 | 846 | 2193 | 7268 |  | true | 3 | strong | rtdb |
| ep-289 | doc-120 | Student 1019 | brain | 3 | tile-168 | systematic | 2 | 1.0 | 68.521 | 2024-02-29 16:21:18.858 | 2024-02-29 16:22:27.379 | entry-546 | entry-547 | 2302 | 2549 | 7268 | Live Output Simulated Gripper | true | 2 | boundary | rtdb |
| ep-290 | doc-120 | Student 1019 | brain | 3 | tile-168 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-29 16:24:58.956 | 2024-02-29 16:24:58.956 | entry-548 | entry-549 | 2934 | 2979 | 7268 | Live Output Simulated Gripper | true | 0 | control | rtdb |
| ep-291 | doc-120 | Student 1019 | brain | 3 | tile-168 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 15:41:59.825 | 2024-03-01 15:41:59.825 | entry-550 | entry-550 | 3800 | 3800 | 7268 | Live Output Simulated Gripper | true | 1 | control | rtdb |
| ep-292 | doc-120 | Student 1019 | brain | 3 | tile-168 | trial_and_error | 8 | 0.875 | 608.104 | 2024-03-01 15:43:03.316 | 2024-03-01 15:53:11.42 | entry-551 | entry-552 | 3881 | 5058 | 7268 | Demo Output Light Bulb, Live Output Simulated Gripper | true | 8 | strong | rtdb |
| ep-293 | doc-120 | Student 1019 | brain | 3 | tile-168 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 15:54:41.148 | 2024-03-01 15:54:41.148 | entry-553 | entry-554 | 5148 | 5159 | 7268 |  | true | 1 | control | rtdb |
| ep-294 | doc-120 | Student 1019 | brain | 3 | tile-168 | trial_and_error | 1 | 1.0 | 0.0 | 2024-03-01 15:58:38.21 | 2024-03-01 15:58:38.21 | entry-555 | entry-556 | 5407 | 5419 | 7268 |  | true | 1 | control | rtdb |
| ep-295 | doc-120 | Student 1019 | brain | 3 | tile-168 | systematic | 2 | 1.0 | 189.255 | 2024-03-01 15:59:12.681 | 2024-03-01 16:02:21.936 | entry-557 | entry-558 | 5454 | 5701 | 7268 |  | true | 2 | boundary | rtdb |
| ep-296 | doc-120 | Student 1019 | brain | 3 | tile-168 | trial_and_error | 4 | 1.0 | 300.372 | 2024-03-01 16:03:28.893 | 2024-03-01 16:08:29.265 | entry-559 | entry-560 | 5781 | 6179 | 7268 |  | true | 4 | strong | rtdb |
| ep-297 | doc-120 | Student 1019 | brain | 3 | tile-168 | systematic | 4 | 0.75 | 236.363 | 2024-03-01 16:11:08.447 | 2024-03-01 16:15:04.81 | entry-561 | entry-562 | 6197 | 6360 | 7268 |  | true | 4 | strong | rtdb |
| ep-298 | doc-120 | Student 1019 | brain | 3 | tile-168 | trial_and_error | 5 | 1.0 | 616.419 | 2024-03-01 16:15:42.325 | 2024-03-01 16:25:58.744 | entry-563 | entry-564 | 6388 | 6808 | 7268 |  | true | 4 | strong | rtdb |
| ep-299 | doc-120 | Student 1019 | brain | 3 | tile-169 | trial_and_error | 9 | 1.0 | 85583.288 | 2024-02-29 15:51:23.175 | 2024-03-01 15:37:46.463 | entry-565 | entry-566 | 6 | 3172 | 7268 |  | true | 0 | strong | rtdb |
| ep-300 | doc-120 | Student 1019 | brain | 3 | tile-170 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-29 16:04:23.73 | 2024-02-29 16:04:23.73 | entry-567 | entry-568 | 504 | 516 | 7268 |  | true | 0 | control | rtdb |
| ep-301 | doc-121 | Student 1011 | brain | 3 | tile-171 | trial_and_error | 2 | 1.0 | 341.799 | 2024-02-29 16:02:34.272 | 2024-02-29 16:08:16.071 | entry-569 | entry-570 | 253 | 486 | 5784 |  | true | 0 | boundary | rtdb |
| ep-302 | doc-121 | Student 1011 | brain | 3 | tile-172 | systematic | 1 | 1.0 | 0.0 | 2024-02-29 16:10:49.478 | 2024-02-29 16:10:49.478 | entry-571 | entry-572 | 539 | 543 | 5784 |  | true | 1 | control | rtdb |
| ep-303 | doc-121 | Student 1011 | brain | 3 | tile-172 | trial_and_error | 3 | 0.6666666666666666 | 181.397 | 2024-02-29 16:15:10.575 | 2024-02-29 16:18:11.972 | entry-573 | entry-574 | 935 | 1210 | 5784 |  | true | 3 | boundary | rtdb |
| ep-304 | doc-121 | Student 1011 | brain | 3 | tile-172 | systematic | 1 | 1.0 | 0.0 | 2024-02-29 16:21:02.284 | 2024-02-29 16:21:02.284 | entry-575 | entry-576 | 1364 | 1375 | 5784 |  | true | 1 | control | rtdb |
| ep-305 | doc-121 | Student 1011 | brain | 3 | tile-172 | trial_and_error | 7 | 0.8571428571428571 | 892.478 | 2024-03-01 15:40:53.62 | 2024-03-01 15:55:46.098 | entry-577 | entry-578 | 2928 | 3963 | 5784 |  | true | 7 | strong | rtdb |
| ep-306 | doc-121 | Student 1011 | brain | 3 | tile-172 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 15:57:29.554 | 2024-03-01 15:57:29.554 | entry-579 | entry-579 | 4017 | 4017 | 5784 |  | true | 1 | control | rtdb |
| ep-307 | doc-121 | Student 1011 | brain | 3 | tile-172 | trial_and_error | 1 | 1.0 | 0.0 | 2024-03-01 15:57:55.184 | 2024-03-01 15:57:55.184 | entry-580 | entry-581 | 4035 | 4061 | 5784 |  | true | 1 | control | rtdb |
| ep-308 | doc-121 | Student 1011 | brain | 3 | tile-172 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 15:58:57.233 | 2024-03-01 15:58:57.233 | entry-582 | entry-582 | 4081 | 4081 | 5784 |  | true | 1 | control | rtdb |
| ep-309 | doc-121 | Student 1011 | brain | 3 | tile-172 | trial_and_error | 9 | 1.0 | 932.002 | 2024-03-01 16:02:12.987 | 2024-03-01 16:17:44.989 | entry-583 | entry-584 | 4221 | 5016 | 5784 |  | true | 8 | strong | rtdb |
| ep-310 | doc-122 | Student 1001 | brain | 3 | tile-173 | trial_and_error | 7 | 1.0 | 87334.749 | 2024-02-29 15:57:36.694 | 2024-03-01 16:13:11.443 | entry-585 | entry-586 | 362 | 4650 | 6876 | Demo Output Grabber, Live Output ⚠️ connect device | true | 1 | strong | rtdb |
| ep-311 | doc-122 | Student 1001 | brain | 3 | tile-174 | trial_and_error | 4 | 0.75 | 186.05 | 2024-02-29 16:15:00.941 | 2024-02-29 16:18:06.991 | entry-587 | entry-588 | 1469 | 1793 | 6876 |  | true | 4 | strong | rtdb |
| ep-312 | doc-122 | Student 1001 | brain | 3 | tile-174 | trial_and_error | 6 | 0.6666666666666666 | 262.351 | 2024-02-29 16:20:41.311 | 2024-02-29 16:25:03.662 | entry-589 | entry-590 | 1881 | 2107 | 6876 |  | true | 6 | strong | rtdb |
| ep-313 | doc-122 | Student 1001 | brain | 3 | tile-174 | systematic | 1 | 1.0 | 0.0 | 2024-02-29 16:25:58.77 | 2024-02-29 16:25:58.77 | entry-591 | entry-592 | 2128 | 2143 | 6876 |  | true | 1 | control | rtdb |
| ep-314 | doc-122 | Student 1001 | brain | 3 | tile-174 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 15:47:32.701 | 2024-03-01 15:47:32.701 | entry-593 | entry-593 | 3180 | 3180 | 6876 |  | true | 1 | control | rtdb |
| ep-315 | doc-122 | Student 1001 | brain | 3 | tile-174 | trial_and_error | 7 | 1.0 | 827.759 | 2024-03-01 15:50:02.844 | 2024-03-01 16:03:50.603 | entry-594 | entry-595 | 3346 | 4163 | 6876 |  | true | 7 | strong | rtdb |
| ep-316 | doc-122 | Student 1001 | brain | 3 | tile-174 | trial_and_error | 7 | 0.8571428571428571 | 799.619 | 2024-03-01 16:08:18.896 | 2024-03-01 16:21:38.515 | entry-596 | entry-597 | 4437 | 6298 | 6876 |  | true | 7 | strong | rtdb |
| ep-317 | doc-122 | Student 1001 | brain | 3 | tile-174 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 16:23:27.592 | 2024-03-01 16:23:27.592 | entry-598 | entry-598 | 6397 | 6397 | 6876 |  | true | 0 | control | rtdb |
| ep-318 | doc-123 | Student 1016 | brain | 3 | tile-175 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-29 16:17:38.526 | 2024-02-29 16:17:38.526 | entry-599 | entry-600 | 3004 | 3058 | 12808 |  | true | 1 | control | rtdb |
| ep-319 | doc-123 | Student 1016 | brain | 3 | tile-175 | trial_and_error | 3 | 1.0 | 83978.093 | 2024-02-29 16:25:09.596 | 2024-03-01 15:44:47.689 | entry-601 | entry-602 | 3510 | 4254 | 12808 |  | true | 2 | boundary | rtdb |
| ep-320 | doc-123 | Student 1016 | brain | 3 | tile-175 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 15:51:18.298 | 2024-03-01 15:51:18.298 | entry-603 | entry-604 | 4805 | 4820 | 12808 |  | true | 1 | control | rtdb |
| ep-321 | doc-123 | Student 1016 | brain | 3 | tile-175 | trial_and_error | 4 | 1.0 | 552.906 | 2024-03-01 15:53:12.893 | 2024-03-01 16:02:25.799 | entry-605 | entry-606 | 4982 | 5656 | 12808 |  | true | 4 | strong | rtdb |
| ep-322 | doc-123 | Student 1016 | brain | 3 | tile-175 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 16:03:41.506 | 2024-03-01 16:03:41.506 | entry-607 | entry-607 | 5694 | 5694 | 12808 |  | true | 1 | control | rtdb |
| ep-323 | doc-123 | Student 1016 | brain | 3 | tile-175 | trial_and_error | 1 | 1.0 | 0.0 | 2024-03-01 16:06:37.83 | 2024-03-01 16:06:37.83 | entry-608 | entry-609 | 5810 | 5815 | 12808 |  | true | 1 | control | rtdb |
| ep-324 | doc-123 | Student 1016 | brain | 3 | tile-175 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 16:08:08.124 | 2024-03-01 16:08:08.124 | entry-610 | entry-610 | 5866 | 5866 | 12808 |  | true | 1 | control | rtdb |
| ep-325 | doc-123 | Student 1016 | brain | 3 | tile-175 | trial_and_error | 4 | 0.75 | 111306.904 | 2024-03-01 16:08:51.512 | 2024-03-02 23:03:58.416 | entry-611 | entry-612 | 5900 | 8430 | 12808 |  | true | 3 | strong | rtdb |
| ep-326 | doc-123 | Student 1016 | brain | 3 | tile-175 | trial_and_error | 9 | 0.8888888888888888 | 245954.206 | 2024-03-02 23:15:43.882 | 2024-03-05 19:34:58.088 | entry-613 | entry-614 | 8990 | 12328 | 12808 |  | true | 8 | strong | rtdb |
| ep-327 | doc-123 | Student 1016 | brain | 3 | tile-175 | trial_and_error | 6 | 0.8333333333333334 | 802.906 | 2024-03-05 19:42:13.692 | 2024-03-05 19:55:36.598 | entry-615 | entry-616 | 12503 | 12763 | 12808 |  | true | 5 | strong | rtdb |
| ep-328 | doc-123 | Student 1016 | brain | 3 | tile-176 | trial_and_error | 10 | 1.0 | 445020.526 | 2024-02-29 15:52:44.804 | 2024-03-05 19:29:45.33 | entry-617 | entry-618 | 6 | 12069 | 12808 |  | true | 3 | strong | rtdb |
| ep-329 | doc-124 | Student 1003 | brain | 3 | tile-177 | trial_and_error | 7 | 1.0 | 86490.997 | 2024-02-29 16:01:47.968 | 2024-03-01 16:03:18.965 | entry-619 | entry-620 | 373 | 3187 | 3311 |  | true | 0 | strong | rtdb |
| ep-330 | doc-124 | Student 1003 | brain | 3 | tile-178 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-29 16:14:07.506 | 2024-02-29 16:14:07.506 | entry-621 | entry-622 | 847 | 870 | 3311 |  | true | 1 | control | rtdb |
| ep-331 | doc-124 | Student 1003 | brain | 3 | tile-178 | trial_and_error | 3 | 1.0 | 150.527 | 2024-02-29 16:17:50.023 | 2024-02-29 16:20:20.55 | entry-623 | entry-624 | 1014 | 1184 | 3311 |  | true | 3 | boundary | rtdb |
| ep-332 | doc-124 | Student 1003 | brain | 3 | tile-178 | trial_and_error | 8 | 0.75 | 1343.56 | 2024-03-01 15:39:17.538 | 2024-03-01 16:01:41.098 | entry-625 | entry-626 | 2059 | 3153 | 3311 |  | true | 6 | strong | rtdb |
| ep-333 | doc-124 | Student 1003 | brain | 3 | tile-179 | trial_and_error | 3 | 0.6666666666666666 | 280.257 | 2024-02-29 15:55:27.035 | 2024-02-29 16:00:07.292 | entry-627 | entry-628 | 274 | 369 | 3311 |  | true | 0 | boundary | rtdb |
| ep-334 | doc-125 | Student 1021 | brain | 3 | tile-180 | trial_and_error | 2 | 1.0 | 234.295 | 2024-02-29 16:02:10.231 | 2024-02-29 16:06:04.526 | entry-629 | entry-630 | 473 | 582 | 2983 |  | true | 0 | boundary | rtdb |
| ep-335 | doc-125 | Student 1021 | brain | 3 | tile-181 | systematic | 3 | 0.6666666666666666 | 76.628 | 2024-02-29 16:11:34.384 | 2024-02-29 16:12:51.012 | entry-631 | entry-632 | 962 | 1067 | 2983 |  | true | 3 | boundary | rtdb |
| ep-336 | doc-125 | Student 1021 | brain | 3 | tile-181 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-29 16:15:00.905 | 2024-02-29 16:15:00.905 | entry-633 | entry-634 | 1237 | 1258 | 2983 |  | true | 1 | control | rtdb |
| ep-337 | doc-125 | Student 1021 | brain | 3 | tile-181 | systematic | 1 | 1.0 | 0.0 | 2024-02-29 16:15:49.341 | 2024-02-29 16:15:49.341 | entry-635 | entry-635 | 1300 | 1300 | 2983 |  | true | 1 | control | rtdb |
| ep-338 | doc-125 | Student 1021 | brain | 3 | tile-181 | trial_and_error | 7 | 0.7142857142857143 | 513.055 | 2024-02-29 16:17:45.991 | 2024-02-29 16:26:19.046 | entry-636 | entry-637 | 1521 | 1984 | 2983 |  | true | 6 | strong | rtdb |
| ep-339 | doc-125 | Student 1021 | brain | 3 | tile-181 | trial_and_error | 3 | 1.0 | 152.899 | 2024-03-07 19:03:28.029 | 2024-03-07 19:06:00.928 | entry-638 | entry-639 | 2425 | 2551 | 2983 |  | true | 3 | boundary | rtdb |
| ep-340 | doc-125 | Student 1021 | brain | 3 | tile-181 | systematic | 1 | 1.0 | 0.0 | 2024-03-07 19:07:01.981 | 2024-03-07 19:07:01.981 | entry-640 | entry-641 | 2569 | 2573 | 2983 |  | true | 1 | control | rtdb |
| ep-341 | doc-125 | Student 1021 | brain | 3 | tile-181 | trial_and_error | 2 | 1.0 | 89.699 | 2024-03-07 19:10:13.393 | 2024-03-07 19:11:43.092 | entry-642 | entry-643 | 2676 | 2757 | 2983 |  | true | 1 | boundary | rtdb |
| ep-342 | doc-126 | Student 1006 | brain | 3 | tile-182 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-29 16:14:50.755 | 2024-02-29 16:14:50.755 | entry-644 | entry-645 | 1140 | 1208 | 9361 |  | true | 1 | control | rtdb |
| ep-343 | doc-126 | Student 1006 | brain | 3 | tile-182 | systematic | 1 | 1.0 | 0.0 | 2024-02-29 16:15:58.947 | 2024-02-29 16:15:58.947 | entry-646 | entry-646 | 1242 | 1242 | 9361 |  | true | 1 | control | rtdb |
| ep-344 | doc-126 | Student 1006 | brain | 3 | tile-182 | systematic | 1 | 1.0 | 0.0 | 2024-02-29 16:20:06.287 | 2024-02-29 16:20:06.287 | entry-647 | entry-647 | 1613 | 1613 | 9361 |  | true | 1 | control | rtdb |
| ep-345 | doc-126 | Student 1006 | brain | 3 | tile-182 | trial_and_error | 1 | 1.0 | 0.0 | 2024-02-29 16:21:35.834 | 2024-02-29 16:21:35.834 | entry-648 | entry-649 | 1731 | 1741 | 9361 |  | true | 1 | control | rtdb |
| ep-346 | doc-126 | Student 1006 | brain | 3 | tile-182 | systematic | 1 | 1.0 | 0.0 | 2024-02-29 16:24:15.255 | 2024-02-29 16:24:15.255 | entry-650 | entry-650 | 1899 | 1899 | 9361 |  | true | 1 | control | rtdb |
| ep-347 | doc-126 | Student 1006 | brain | 3 | tile-182 | trial_and_error | 4 | 1.0 | 83920.038 | 2024-02-29 16:26:20.889 | 2024-03-01 15:45:00.927 | entry-651 | entry-652 | 2038 | 3041 | 9361 |  | true | 3 | strong | rtdb |
| ep-348 | doc-126 | Student 1006 | brain | 3 | tile-182 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 15:48:16.5 | 2024-03-01 15:48:16.5 | entry-653 | entry-653 | 3230 | 3230 | 9361 |  | true | 1 | control | rtdb |
| ep-349 | doc-126 | Student 1006 | brain | 3 | tile-182 | trial_and_error | 4 | 1.0 | 160.273 | 2024-03-01 15:48:42.674 | 2024-03-01 15:51:22.947 | entry-654 | entry-655 | 3259 | 3435 | 9361 |  | true | 4 | strong | rtdb |
| ep-350 | doc-126 | Student 1006 | brain | 3 | tile-182 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 15:52:06.197 | 2024-03-01 15:52:06.197 | entry-656 | entry-656 | 3478 | 3478 | 9361 |  | true | 1 | control | rtdb |
| ep-351 | doc-126 | Student 1006 | brain | 3 | tile-182 | trial_and_error | 1 | 1.0 | 0.0 | 2024-03-01 15:54:13.274 | 2024-03-01 15:54:13.274 | entry-657 | entry-658 | 3661 | 3664 | 9361 |  | true | 1 | control | rtdb |
| ep-352 | doc-126 | Student 1006 | brain | 3 | tile-182 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 15:57:21.003 | 2024-03-01 15:57:21.003 | entry-659 | entry-659 | 3959 | 3959 | 9361 |  | true | 1 | control | rtdb |
| ep-353 | doc-126 | Student 1006 | brain | 3 | tile-182 | trial_and_error | 7 | 1.0 | 441.71 | 2024-03-01 16:00:10.619 | 2024-03-01 16:07:32.329 | entry-660 | entry-661 | 4095 | 4618 | 9361 |  | true | 7 | strong | rtdb |
| ep-354 | doc-126 | Student 1006 | brain | 3 | tile-182 | systematic | 3 | 1.0 | 87.587 | 2024-03-01 16:09:43.931 | 2024-03-01 16:11:11.518 | entry-662 | entry-663 | 4645 | 4710 | 9361 |  | true | 3 | boundary | rtdb |
| ep-355 | doc-126 | Student 1006 | brain | 3 | tile-182 | trial_and_error | 3 | 1.0 | 694.932 | 2024-03-05 19:12:58.769 | 2024-03-05 19:24:33.701 | entry-664 | entry-665 | 8014 | 8503 | 9361 |  | true | 3 | boundary | rtdb |
| ep-356 | doc-126 | Student 1006 | brain | 3 | tile-182 | systematic | 1 | 1.0 | 0.0 | 2024-03-05 19:25:04.154 | 2024-03-05 19:25:04.154 | entry-666 | entry-666 | 8537 | 8537 | 9361 |  | true | 1 | control | rtdb |
| ep-357 | doc-126 | Student 1006 | brain | 3 | tile-182 | trial_and_error | 2 | 1.0 | 53.226 | 2024-03-05 19:25:34.823 | 2024-03-05 19:26:28.049 | entry-667 | entry-668 | 8578 | 8646 | 9361 |  | true | 2 | boundary | rtdb |
| ep-358 | doc-126 | Student 1006 | brain | 3 | tile-182 | systematic | 1 | 1.0 | 0.0 | 2024-03-05 19:27:16.101 | 2024-03-05 19:27:16.101 | entry-669 | entry-669 | 8688 | 8688 | 9361 |  | true | 1 | control | rtdb |
| ep-359 | doc-126 | Student 1006 | brain | 3 | tile-182 | trial_and_error | 1 | 1.0 | 0.0 | 2024-03-05 19:27:44.353 | 2024-03-05 19:27:44.353 | entry-670 | entry-671 | 8717 | 8757 | 9361 |  | true | 1 | control | rtdb |
| ep-360 | doc-126 | Student 1006 | brain | 3 | tile-182 | systematic | 2 | 1.0 | 56.014 | 2024-03-05 19:29:35.703 | 2024-03-05 19:30:31.717 | entry-672 | entry-673 | 8792 | 8832 | 9361 |  | true | 2 | boundary | rtdb |
| ep-361 | doc-126 | Student 1006 | brain | 3 | tile-182 | trial_and_error | 2 | 1.0 | 70.307 | 2024-03-05 19:31:14.021 | 2024-03-05 19:32:24.328 | entry-674 | entry-675 | 8851 | 8928 | 9361 |  | true | 2 | boundary | rtdb |
| ep-362 | doc-126 | Student 1006 | brain | 3 | tile-182 | systematic | 4 | 1.0 | 226.254 | 2024-03-05 19:34:02.027 | 2024-03-05 19:37:48.281 | entry-676 | entry-677 | 8957 | 9072 | 9361 |  | true | 4 | strong | rtdb |
| ep-363 | doc-126 | Student 1006 | brain | 3 | tile-182 | trial_and_error | 2 | 1.0 | 87.819 | 2024-03-05 19:38:30.62 | 2024-03-05 19:39:58.439 | entry-678 | entry-679 | 9093 | 9139 | 9361 |  | true | 2 | boundary | rtdb |
| ep-364 | doc-126 | Student 1006 | brain | 3 | tile-182 | systematic | 1 | 1.0 | 0.0 | 2024-03-05 19:42:12.969 | 2024-03-05 19:42:12.969 | entry-680 | entry-680 | 9179 | 9179 | 9361 |  | true | 1 | control | rtdb |
| ep-365 | doc-126 | Student 1006 | brain | 3 | tile-182 | trial_and_error | 2 | 1.0 | 79.612 | 2024-03-05 19:42:57.184 | 2024-03-05 19:44:16.796 | entry-681 | entry-682 | 9197 | 9249 | 9361 |  | true | 2 | boundary | rtdb |
| ep-366 | doc-126 | Student 1006 | brain | 3 | tile-182 | systematic | 3 | 1.0 | 158.989 | 2024-03-05 19:45:30.349 | 2024-03-05 19:48:09.338 | entry-683 | entry-684 | 9267 | 9323 | 9361 |  | true | 2 | boundary | rtdb |
| ep-367 | doc-126 | Student 1006 | brain | 3 | tile-183 | trial_and_error | 3 | 1.0 | 508.714 | 2024-02-29 16:02:37.449 | 2024-02-29 16:11:06.163 | entry-685 | entry-686 | 530 | 907 | 9361 |  | true | 0 | boundary | rtdb |
| ep-368 | doc-127 | Student 1007 | brain | 3 | tile-184 | trial_and_error | 1 | 1.0 | 0.0 | 2024-03-01 15:59:37.809 | 2024-03-01 15:59:37.809 | entry-687 | entry-688 | 580 | 726 | 3510 |  | true | 1 | control | rtdb |
| ep-369 | doc-127 | Student 1007 | brain | 3 | tile-184 | trial_and_error | 5 | 0.6 | 326.026 | 2024-03-01 16:02:58.997 | 2024-03-01 16:08:25.023 | entry-689 | entry-690 | 1173 | 1608 | 3510 |  | true | 5 | strong | rtdb |
| ep-370 | doc-127 | Student 1007 | brain | 3 | tile-184 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 16:09:15.196 | 2024-03-01 16:09:15.196 | entry-691 | entry-692 | 1641 | 1660 | 3510 |  | true | 1 | control | rtdb |
| ep-371 | doc-127 | Student 1007 | brain | 3 | tile-184 | trial_and_error | 3 | 1.0 | 185.23 | 2024-03-01 16:13:00.053 | 2024-03-01 16:16:05.283 | entry-693 | entry-694 | 1843 | 2105 | 3510 |  | true | 3 | boundary | rtdb |
| ep-372 | doc-127 | Student 1007 | brain | 3 | tile-184 | trial_and_error | 8 | 1.0 | 528434.829 | 2024-03-01 16:26:47.408 | 2024-03-07 19:14:02.237 | entry-695 | entry-696 | 2458 | 3357 | 3510 |  | true | 6 | strong | rtdb |
| ep-373 | doc-127 | Student 1007 | brain | 3 | tile-184 | systematic | 1 | 1.0 | 0.0 | 2024-03-07 19:19:58.345 | 2024-03-07 19:19:58.345 | entry-697 | entry-697 | 3419 | 3419 | 3510 |  | true | 0 | control | rtdb |
| ep-374 | doc-127 | Student 1007 | brain | 3 | tile-185 | trial_and_error | 4 | 1.0 | 263.098 | 2024-03-01 15:50:32.777 | 2024-03-01 15:54:55.875 | entry-698 | entry-699 | 108 | 287 | 3510 |  | true | 0 | strong | rtdb |
| ep-375 | doc-128 | Student 1002 | brain | 3 | tile-186 | trial_and_error | 6 | 0.6666666666666666 | 597.88 | 2024-03-01 15:58:44.916 | 2024-03-01 16:08:42.796 | entry-700 | entry-701 | 780 | 1381 | 3066 |  | true | 6 | strong | rtdb |
| ep-376 | doc-128 | Student 1002 | brain | 3 | tile-186 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 16:09:29.148 | 2024-03-01 16:09:29.148 | entry-702 | entry-702 | 1412 | 1412 | 3066 |  | true | 1 | control | rtdb |
| ep-377 | doc-128 | Student 1002 | brain | 3 | tile-186 | trial_and_error | 3 | 1.0 | 301.88 | 2024-03-01 16:11:47.955 | 2024-03-01 16:16:49.835 | entry-703 | entry-704 | 1518 | 1737 | 3066 |  | true | 3 | boundary | rtdb |
| ep-378 | doc-128 | Student 1002 | brain | 3 | tile-186 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 16:17:55.943 | 2024-03-01 16:17:55.943 | entry-705 | entry-705 | 1772 | 1772 | 3066 |  | true | 1 | control | rtdb |
| ep-379 | doc-128 | Student 1002 | brain | 3 | tile-186 | trial_and_error | 3 | 1.0 | 144.052 | 2024-03-04 18:58:04.372 | 2024-03-04 19:00:28.424 | entry-706 | entry-707 | 2564 | 2686 | 3066 |  | true | 2 | boundary | rtdb |
| ep-380 | doc-128 | Student 1002 | brain | 3 | tile-187 | trial_and_error | 2 | 1.0 | 214.808 | 2024-03-01 15:50:27.874 | 2024-03-01 15:54:02.682 | entry-708 | entry-709 | 313 | 560 | 3066 |  | true | 0 | boundary | rtdb |
| ep-381 | doc-129 | Student 1023 | brain | 3 | tile-188 | trial_and_error | 1 | 1.0 | 0.0 | 2024-03-01 16:18:09.803 | 2024-03-01 16:18:09.803 | entry-710 | entry-711 | 98 | 115 | 1118 |  | true | 0 | control | rtdb |
| ep-382 | doc-129 | Student 1023 | brain | 3 | tile-188 | systematic | 1 | 1.0 | 0.0 | 2024-03-01 16:23:19.092 | 2024-03-01 16:23:19.092 | entry-712 | entry-713 | 126 | 131 | 1118 |  | true | 1 | control | rtdb |
| ep-383 | doc-129 | Student 1023 | brain | 3 | tile-188 | systematic | 1 | 1.0 | 0.0 | 2024-03-07 19:23:37.202 | 2024-03-07 19:23:37.202 | entry-714 | entry-714 | 774 | 774 | 1118 |  | true | 1 | control | rtdb |
| ep-384 | doc-129 | Student 1023 | brain | 3 | tile-188 | trial_and_error | 1 | 1.0 | 0.0 | 2024-03-07 19:24:28.717 | 2024-03-07 19:24:28.717 | entry-715 | entry-716 | 789 | 806 | 1118 |  | true | 1 | control | rtdb |
| ep-385 | doc-129 | Student 1023 | brain | 3 | tile-188 | systematic | 2 | 1.0 | 35.036 | 2024-03-07 19:25:28.51 | 2024-03-07 19:26:03.546 | entry-717 | entry-718 | 822 | 839 | 1118 |  | true | 2 | boundary | rtdb |
| ep-386 | doc-129 | Student 1023 | brain | 3 | tile-188 | trial_and_error | 1 | 1.0 | 0.0 | 2024-03-07 19:27:34.124 | 2024-03-07 19:27:34.124 | entry-719 | entry-720 | 874 | 885 | 1118 |  | true | 0 | control | rtdb |

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

## systematic — strong (2 shown)

### ep-297

- **date:** 2024-03-01
- **unit/problem:** brain 3
- **document:** `doc-120`
- **outputs:** none
- **ticks:** 4 of 4 pauses covered
- **cycles:** 4
- **changes:** 6 param (Logic, Control)
- **start:** 2024-03-01 16:11:08 · entry 6197 of 7268 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-120&studentDocumentHistoryId=entry-561)
- **end:** 2024-03-01 16:15:04 · entry 6360 of 7268 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-120&studentDocumentHistoryId=entry-562)

```
1. 2024-03-01 16:11:08, history start 6197, duration 99s
  Program Changes (0s)
    set Logic.logicOperator = Less Than
  Outside Program (99s, present unknown)
    sim: Gripper 86..90 x2, Surface Pressure 195..225 x2
2. 2024-03-01 16:12:47, history start 6254, duration 84s
  Program Changes (35s, 2 targets)
    set Logic.logicOperator = Greater Than
    set Logic.logicOperator = Less Than
    set Control.controlOperator = Hold Current
  Outside Program (48s, present unknown)
    tested Target EMG x4
    sim: no change
3. 2024-03-01 16:14:10, history start 6309, duration 54s
  Program Changes (0s)
    set Logic.logicOperator = Equal
  Outside Program (54s, present unknown)
    sim: Gripper 18..89 x20, Surface Pressure 0..218 x14
4. 2024-03-01 16:15:04, history start 6360, duration 38s
  Program Changes (0s)
    set Logic.logicOperator = Less Than
  Outside Program (38s, present unknown)
    tested Target EMG x4
    sim: Gripper 81..100 x6, Surface Pressure 158..300 x7
```

### ep-362

- **date:** 2024-03-05
- **unit/problem:** brain 3
- **document:** `doc-126`
- **outputs:** none
- **ticks:** 4 of 4 pauses covered
- **cycles:** 4
- **changes:** 4 conn (Control)
- **start:** 2024-03-05 19:34:02 · entry 8957 of 9361 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-126&studentDocumentHistoryId=entry-676)
- **end:** 2024-03-05 19:37:48 · entry 9072 of 9361 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-126&studentDocumentHistoryId=entry-677)

```
1. 2024-03-05 19:34:02, history start 8957, duration 2m 7s
  Program Changes (0s)
    disconnected the num1 input of Control
  Outside Program (2m 7s, present unknown)
    tested Target EMG x1
    sim: Gripper 9..95 x28, Surface Pressure 0..263 x6
2. 2024-03-05 19:36:08, history start 9024, duration 72s
  Program Changes (0s)
    connected Logic -> Control (num1)
  Outside Program (72s, present unknown)
    tested Target EMG x1
    sim: Gripper 9..99 x10, Surface Pressure 15..293 x5
3. 2024-03-05 19:37:20, history start 9055, duration 27s
  Program Changes (0s)
    disconnected the num1 input of Control
  Outside Program (27s, present unknown)
    tested Target EMG x1
    sim: Gripper 60..100 x6, Surface Pressure 45..300 x5
4. 2024-03-05 19:37:48, history start 9072, duration 42s
  Program Changes (0s)
    connected Logic -> Control (num1)
  Outside Program (42s, present unknown)
    tested Target EMG x1
    sim: Gripper 48..100 x7, Surface Pressure 0..300 x5
```

## systematic — boundary (15 shown)

### ep-150

- **date:** 2024-02-29
- **unit/problem:** brain 2
- **document:** `doc-096`
- **outputs:** none
- **ticks:** 1 of 2 pauses covered
- **cycles:** 2
- **changes:** 1 node, 3 param (Sensor)
- **start:** 2024-02-29 15:47:49 · entry 901 of 995 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-096&studentDocumentHistoryId=entry-294)
- **end:** 2024-02-29 15:48:27 · entry 951 of 995 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-096&studentDocumentHistoryId=entry-295)

```
1. 2024-02-29 15:47:49, history start 901, duration 38s
  Program Changes (0s)
    added a Sensor node
  Outside Program (38s, present unknown)
    sim: no change
2. 2024-02-29 15:48:27, history start 933, then no further edits
  Program Changes (20s)
    set Sensor.type = fsr-reading
    set Sensor.sensor = SIMpressure_key
    set Sensor.plot = true
  Outside Program (no further edits, showing 120s)
    tested Target EMG x1
    sim: Gripper 0..100 x2, Surface Pressure 0..300 x2
```

### ep-151

- **date:** 2024-02-28
- **unit/problem:** brain 2
- **document:** `doc-097`
- **outputs:** none
- **ticks:** 2 of 3 pauses covered
- **cycles:** 3
- **changes:** 1 node, 1 conn, 3 param (Sensor)
- **start:** 2024-02-28 22:06:40 · entry 2252 of 4638 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-097&studentDocumentHistoryId=entry-296)
- **end:** 2024-02-28 22:14:14 · entry 3714 of 4638 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-097&studentDocumentHistoryId=entry-297)

```
1. 2024-02-28 22:06:40, history start 2252, duration 6m 34s
  Program Changes (0s)
    set ?.hubSelect = Simulated Gripper
  Outside Program (6m 34s, long)
    tested Target EMG x3
    sim: no change
2. 2024-02-28 22:13:15, history start 3644, duration 60s
  Program Changes (0s)
    connected ? -> ? (num1)
  Outside Program (60s, present unknown)
    tested Target EMG x3
    sim: Gripper 0..100 x5, Surface Pressure 0..300 x5
3. 2024-02-28 22:14:14, history start 3705, duration 17h 34m
  Program Changes (13s)
    added a Sensor node
    set Sensor.type = fsr-reading
    set Sensor.sensor = SIMpressure_key
  Outside Program (17h 34m, long)
    tested Target EMG x15
    sim: Gripper 0..100 x51, Surface Pressure 0..300 x48
```

### ep-152

- **date:** 2024-02-29
- **unit/problem:** brain 2
- **document:** `doc-098`
- **outputs:** none
- **ticks:** 2 of 2 pauses covered
- **cycles:** 2
- **changes:** 1 node, 1 param (Sensor)
- **start:** 2024-02-29 15:42:43 · entry 2412 of 2966 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-098&studentDocumentHistoryId=entry-298)
- **end:** 2024-02-29 15:47:50 · entry 2853 of 2966 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-098&studentDocumentHistoryId=entry-299)

```
1. 2024-02-29 15:42:43, history start 2412, duration 5m 7s
  Program Changes (0s)
    set ?.hubSelect = Simulated Gripper
  Outside Program (5m 7s, long)
    tested Target EMG x15
    sim: Gripper 0..100 x69, Surface Pressure 0..300 x65
2. 2024-02-29 15:47:50, history start 2853, duration 31s
  Program Changes (0s)
    added a Sensor node
  Outside Program (31s, watching)
    sim: Gripper 0..100 x2
```

### ep-160

- **date:** 2024-02-29
- **unit/problem:** brain 2
- **document:** `doc-105`
- **outputs:** none
- **ticks:** 2 of 2 pauses covered
- **cycles:** 2
- **changes:** 3 conn
- **start:** 2024-02-29 15:42:49 · entry 1271 of 1750 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-105&studentDocumentHistoryId=entry-313)
- **end:** 2024-02-29 15:44:31 · entry 1395 of 1750 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-105&studentDocumentHistoryId=entry-314)

```
1. 2024-02-29 15:42:49, history start 1271, duration 102s
  Program Changes (3s)
    connected ? -> ? (num2)
    connected ? -> ? (num1)
  Outside Program (99s, present unknown)
    sim: no change
2. 2024-02-29 15:44:31, history start 1395, duration 3m 26s
  Program Changes (0s)
    connected ? -> ? (nodeValue)
  Outside Program (3m 26s, present unknown)
    tested Target EMG x3
    sim: Gripper 0..100 x5, Surface Pressure 0..300 x5
```

### ep-187

- **date:** 2024-03-01
- **unit/problem:** brain 3
- **document:** `doc-110`
- **outputs:** none
- **ticks:** 1 of 2 pauses covered
- **cycles:** 2
- **changes:** 2 param (Logic)
- **start:** 2024-03-01 17:03:07 · entry 5788 of 7206 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-110&studentDocumentHistoryId=entry-361)
- **end:** 2024-03-01 17:03:55 · entry 5803 of 7206 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-110&studentDocumentHistoryId=entry-362)

```
1. 2024-03-01 17:03:07, history start 5788, duration 48s
  Program Changes (0s)
    set Logic.logicOperator = Less Than
  Outside Program (48s, present unknown)
    tested Target EMG x1
    sim: Gripper 49..74 x5, Surface Pressure 0..105 x3
2. 2024-03-01 17:03:55, history start 5803, duration 10m 39s
  Program Changes (0s)
    set Logic.logicOperator = Greater Than
  Outside Program (10m 39s, long)
    tested Target EMG x3
    sim: Gripper 54..100 x16, Surface Pressure 0..300 x5
```

### ep-191

- **date:** 2024-03-07
- **unit/problem:** brain 3
- **document:** `doc-110`
- **outputs:** Live Output Simulated Gripper
- **ticks:** 3 of 3 pauses covered
- **cycles:** 3
- **changes:** 1 conn, 6 param (Transform, Control)
- **start:** 2024-03-07 19:18:54 · entry 7046 of 7206 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-110&studentDocumentHistoryId=entry-369)
- **end:** 2024-03-07 19:20:39 · entry 7094 of 7206 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-110&studentDocumentHistoryId=entry-370)

```
1. 2024-03-07 19:18:54, history start 7046, duration 44s
  Program Changes (11s)
    set Transform.transformOperator = Absolute Value
    set Transform.transformOperator = Round
    set Transform.transformOperator = Ramp
  Outside Program (33s, present unknown)
    sim: no change
2. 2024-03-07 19:19:38, history start 7063, duration 61s
  Program Changes (7s)
    set Control.controlOperator = Hold Prior
    set Control.controlOperator = Output Zero
  Outside Program (54s, present unknown)
    sim: Gripper 0..100 x5, Surface Pressure 0..300 x5
3. 2024-03-07 19:20:39, history start 7089, duration 50s
  Program Changes (6s)
    set Control.controlOperator = Hold Current
    disconnected the num1 input of Control
  Outside Program (44s, present unknown)
    tested Target EMG x1
    sim: Gripper 48..90 x7, Surface Pressure 0..225 x5
```

### ep-207

- **date:** 2024-03-01
- **unit/problem:** brain 3
- **document:** `doc-112`
- **outputs:** none
- **ticks:** 2 of 2 pauses covered
- **cycles:** 2
- **changes:** 1 conn, 1 param (Control)
- **start:** 2024-03-01 15:48:41 · entry 2372 of 4735 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-112&studentDocumentHistoryId=entry-399)
- **end:** 2024-03-01 15:50:13 · entry 2469 of 4735 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-112&studentDocumentHistoryId=entry-400)

```
1. 2024-03-01 15:48:41, history start 2372, duration 92s
  Program Changes (0s)
    connected Transform -> Control (num1)
  Outside Program (92s, present unknown)
    sim: no change
2. 2024-03-01 15:50:13, history start 2469, duration 61s
  Program Changes (0s)
    set ?.hubSelect = Simulated Gripper
  Outside Program (61s, present unknown)
    tested Target EMG x2
    sim: no change
```

### ep-213

- **date:** 2024-03-01
- **unit/problem:** brain 3
- **document:** `doc-112`
- **outputs:** none
- **ticks:** 2 of 3 pauses covered
- **cycles:** 3
- **changes:** 1 node, 1 conn, 1 param (Sensor, Logic)
- **start:** 2024-03-01 16:11:39 · entry 3591 of 4735 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-112&studentDocumentHistoryId=entry-409)
- **end:** 2024-03-01 16:15:04 · entry 3705 of 4735 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-112&studentDocumentHistoryId=entry-410)

```
1. 2024-03-01 16:11:39, history start 3591, duration 68s
  Program Changes (0s)
    added a Sensor node
  Outside Program (68s, present unknown)
    sim: no change
2. 2024-03-01 16:12:47, history start 3630, duration 2m 17s
  Program Changes (0s)
    connected Sensor -> Logic (num2)
  Outside Program (2m 17s, present unknown)
    tested Target EMG x4
    sim: no change
3. 2024-03-01 16:15:04, history start 3705, duration 146h 49m
  Program Changes (0s)
    set Logic.plot = true
  Outside Program (146h 49m, long)
    tested Target EMG x1
    sim: no change
```

### ep-226

- **date:** 2024-03-05
- **unit/problem:** brain 3
- **document:** `doc-113`
- **outputs:** none
- **ticks:** 2 of 2 pauses covered
- **cycles:** 2
- **changes:** 2 conn (Control)
- **start:** 2024-03-05 19:26:44 · entry 3992 of 4442 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-113&studentDocumentHistoryId=entry-431)
- **end:** 2024-03-05 19:27:10 · entry 4011 of 4442 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-113&studentDocumentHistoryId=entry-432)

```
1. 2024-03-05 19:26:44, history start 3992, duration 26s
  Program Changes (0s)
    disconnected the num1 input of Control
  Outside Program (26s, present unknown)
    sim: Gripper 9..10 x3, Surface Pressure 0..300 x2
2. 2024-03-05 19:27:10, history start 4011, duration 55s
  Program Changes (0s)
    connected Transform -> Control (num1)
  Outside Program (55s, watching)
    sim: Gripper 28..100 x10, Surface Pressure 120..300 x8
```

### ep-228

- **date:** 2024-03-05
- **unit/problem:** brain 3
- **document:** `doc-113`
- **outputs:** none
- **ticks:** 2 of 2 pauses covered
- **cycles:** 2
- **changes:** 2 conn (Control)
- **start:** 2024-03-05 19:32:14 · entry 4224 of 4442 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-113&studentDocumentHistoryId=entry-435)
- **end:** 2024-03-05 19:32:53 · entry 4247 of 4442 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-113&studentDocumentHistoryId=entry-436)

```
1. 2024-03-05 19:32:14, history start 4224, duration 38s
  Program Changes (0s)
    disconnected the num1 input of Control
  Outside Program (38s, present unknown)
    tested Target EMG x1
    sim: Gripper 9..10 x8
2. 2024-03-05 19:32:53, history start 4247, duration 40s
  Program Changes (0s)
    connected Transform -> Control (num1)
  Outside Program (40s, present unknown)
    tested Target EMG x1
    sim: Gripper 10..100 x3
```

### ep-237

- **date:** 2024-03-05
- **unit/problem:** brain 3
- **document:** `doc-114`
- **outputs:** Live Output Simulated Gripper
- **ticks:** 1 of 2 pauses covered
- **cycles:** 2
- **changes:** 2 conn (Control)
- **start:** 2024-03-05 19:29:51 · entry 3543 of 4231 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-114&studentDocumentHistoryId=entry-452)
- **end:** 2024-03-05 19:30:24 · entry 3597 of 4231 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-114&studentDocumentHistoryId=entry-453)

```
1. 2024-03-05 19:29:51, history start 3543, duration 34s
  Program Changes (0s)
    disconnected the num1 input of Control
  Outside Program (34s, present unknown)
    sim: Gripper 12..68 x21, Surface Pressure 0..60 x3
2. 2024-03-05 19:30:24, history start 3597, then no further edits
  Program Changes (0s)
    connected Logic -> Control (num1)
  Outside Program (no further edits, showing 120s)
    tested Target EMG x2
    sim: Gripper 12..90 x12, Surface Pressure 38..225 x5
```

### ep-253

- **date:** 2024-03-01
- **unit/problem:** brain 3
- **document:** `doc-116`
- **outputs:** none
- **ticks:** 2 of 2 pauses covered
- **cycles:** 2
- **changes:** 2 param (Logic)
- **start:** 2024-03-01 16:14:39 · entry 5737 of 6496 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-116&studentDocumentHistoryId=entry-481)
- **end:** 2024-03-01 16:15:08 · entry 5754 of 6496 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-116&studentDocumentHistoryId=entry-482)

```
1. 2024-03-01 16:14:39, history start 5737, duration 29s
  Program Changes (0s)
    set Logic.logicOperator = Or
  Outside Program (29s, present unknown)
    sim: no change
2. 2024-03-01 16:15:08, history start 5754, duration 47s
  Program Changes (0s)
    set Logic.logicOperator = Greater Than
  Outside Program (47s, present unknown)
    tested Target EMG x2
    sim: Gripper 90..100 x13, Surface Pressure 225..300 x13
```

### ep-270

- **date:** 2024-03-01
- **unit/problem:** brain 3
- **document:** `doc-118`
- **outputs:** none
- **ticks:** 3 of 3 pauses covered
- **cycles:** 3
- **changes:** 2 conn, 2 param (Control, Sensor)
- **start:** 2024-03-01 15:52:23 · entry 4239 of 6186 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-118&studentDocumentHistoryId=entry-513)
- **end:** 2024-03-01 15:54:11 · entry 4394 of 6186 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-118&studentDocumentHistoryId=entry-514)

```
1. 2024-03-01 15:52:23, history start 4239, duration 68s
  Program Changes (0s)
    disconnected the num1 input of Control
  Outside Program (68s, present unknown)
    sim: Gripper 72..80 x45, Surface Pressure 90..150 x45
2. 2024-03-01 15:53:30, history start 4336, duration 41s
  Program Changes (4s)
    set Sensor.plot = true
    set Sensor.plot = false
  Outside Program (37s, watching)
    tested Target EMG x4
    sim: Gripper 37..85 x21, Surface Pressure 0..188 x18
3. 2024-03-01 15:54:11, history start 4394, duration 2m 42s
  Program Changes (0s)
    connected Sensor -> Control (num1)
  Outside Program (2m 42s, present unknown)
    tested Target EMG x1
    sim: Gripper 9..90 x86, Surface Pressure 0..225 x41
```

### ep-277

- **date:** 2024-02-29
- **unit/problem:** brain 3
- **document:** `doc-119`
- **outputs:** none
- **ticks:** 2 of 2 pauses covered
- **cycles:** 2
- **changes:** 1 node, 1 param (Transform)
- **start:** 2024-02-29 16:14:38 · entry 1344 of 6155 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-119&studentDocumentHistoryId=entry-525)
- **end:** 2024-02-29 16:15:11 · entry 1437 of 6155 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-119&studentDocumentHistoryId=entry-526)

```
1. 2024-02-29 16:14:38, history start 1344, duration 33s
  Program Changes (0s)
    set ?.hubSelect = Simulated Gripper
  Outside Program (33s, watching)
    tested Target EMG x4
    sim: Gripper 9..100 x30, Surface Pressure 0..300 x10
2. 2024-02-29 16:15:11, history start 1437, duration 28s
  Program Changes (0s)
    added a Transform node
  Outside Program (28s, present unknown)
    sim: Gripper 9..10 x26
```

### ep-289

- **date:** 2024-02-29
- **unit/problem:** brain 3
- **document:** `doc-120`
- **outputs:** Live Output Simulated Gripper
- **ticks:** 2 of 2 pauses covered
- **cycles:** 2
- **changes:** 3 param (Control)
- **start:** 2024-02-29 16:21:18 · entry 2302 of 7268 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-120&studentDocumentHistoryId=entry-546)
- **end:** 2024-02-29 16:22:27 · entry 2549 of 7268 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-120&studentDocumentHistoryId=entry-547)

```
1. 2024-02-29 16:21:18, history start 2302, duration 69s
  Program Changes (3s)
    set Control.controlOperator = Hold Prior
    set Control.controlOperator = Hold Current
  Outside Program (65s, present unknown)
    tested Target EMG x1
    sim: Gripper 0..100 x153
2. 2024-02-29 16:22:27, history start 2549, duration 2m 32s
  Program Changes (0s)
    set Control.controlOperator = Hold Prior
  Outside Program (2m 32s, present unknown)
    tested Target EMG x3
    sim: Gripper 9..100 x222
```

## systematic — control (15 shown)

### ep-003

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-002`
- **outputs:** none
- **ticks:** none -- this document has no tick data at all
- **cycles:** 1
- **changes:** 1 node (Math)
- **start:** 2024-02-05 18:25:37 · entry 169 of 742 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-002&studentDocumentHistoryId=entry-005)
- **end:** 2024-02-05 18:25:37 · entry 169 of 742 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-002&studentDocumentHistoryId=entry-005)

```
1. 2024-02-05 18:25:37, history start 169, duration 36s
  Program Changes (0s)
    added a Math node
  Outside Program (36s, documenting)
    sim: not running
```

### ep-096

- **date:** 2024-02-14
- **unit/problem:** brain 2
- **document:** `doc-064`
- **outputs:** none
- **ticks:** none -- this document has no tick data at all
- **cycles:** 1
- **changes:** 1 param (Generator)
- **start:** 2024-02-14 03:05:45 · entry 719 of 2132 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-064&studentDocumentHistoryId=entry-190)
- **end:** 2024-02-14 03:05:45 · entry 719 of 2132 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-064&studentDocumentHistoryId=entry-190)

```
1. 2024-02-14 03:05:45, history start 719, duration 4m 37s
  Program Changes (0s)
    set Generator.plot = true
  Outside Program (4m 37s, documenting)
    sim: not running
```

### ep-101

- **date:** 2024-02-16
- **unit/problem:** brain 4
- **document:** `doc-067`
- **outputs:** none
- **ticks:** none during this episode (the document has some)
- **cycles:** 1
- **changes:** 1 node (Sensor)
- **start:** 2024-02-16 15:51:49 · entry 1041 of 2197 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-067&studentDocumentHistoryId=entry-199)
- **end:** 2024-02-16 15:51:49 · entry 1041 of 2197 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-067&studentDocumentHistoryId=entry-199)

```
1. 2024-02-16 15:51:49, history start 1041, duration 100s
  Program Changes (0s)
    added a Sensor node
  Outside Program (100s, documenting)
    sim: not running
```

### ep-132

- **date:** 2024-02-22
- **unit/problem:** brain 5
- **document:** `doc-084`
- **outputs:** Live Output Simulated Gripper
- **ticks:** none during this episode (the document has some)
- **cycles:** 1
- **changes:** 1 param (Generator)
- **start:** 2024-02-22 15:56:38 · entry 900 of 5674 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-084&studentDocumentHistoryId=entry-260)
- **end:** 2024-02-22 15:56:38 · entry 900 of 5674 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-084&studentDocumentHistoryId=entry-260)

```
1. 2024-02-22 15:56:38, history start 900, duration 4m 34s
  Program Changes (0s)
    set Generator.period = 2
  Outside Program (4m 34s, documenting)
    sim: Gripper 0..100 x304
```

### ep-148

- **date:** 2024-02-28
- **unit/problem:** brain 2
- **document:** `doc-095`
- **outputs:** none
- **ticks:** none during this episode (the document has some)
- **cycles:** 1
- **changes:** 1 param
- **start:** 2024-02-28 17:25:12 · entry 1089 of 2807 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-095&studentDocumentHistoryId=entry-291)
- **end:** 2024-02-28 17:25:12 · entry 1089 of 2807 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-095&studentDocumentHistoryId=entry-291)

```
1. 2024-02-28 17:25:12, history start 1089, duration 22h 22m
  Program Changes (0s)
    set ?.hubSelect = Simulated Gripper
  Outside Program (22h 22m, long)
    tested Target EMG x4
    sim: Gripper 0..100 x13, Surface Pressure 0..300 x13
```

### ep-155

- **date:** 2024-02-29
- **unit/problem:** brain 2
- **document:** `doc-101`
- **outputs:** none
- **ticks:** 1 of 1 pauses covered
- **cycles:** 1
- **changes:** 1 node (Sensor)
- **start:** 2024-02-29 15:48:01 · entry 1164 of 2078 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-101&studentDocumentHistoryId=entry-304)
- **end:** 2024-02-29 15:48:01 · entry 1164 of 2078 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-101&studentDocumentHistoryId=entry-304)

```
1. 2024-02-29 15:48:01, history start 1164, duration 30s
  Program Changes (0s)
    added a Sensor node
  Outside Program (30s, watching)
    sim: no change
```

### ep-158

- **date:** 2024-02-29
- **unit/problem:** brain 2
- **document:** `doc-103`
- **outputs:** none
- **ticks:** none during this episode (the document has some)
- **cycles:** 1
- **changes:** 1 node, 2 param (Sensor)
- **start:** 2024-02-29 15:49:34 · entry 3543 of 3617 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-103&studentDocumentHistoryId=entry-309)
- **end:** 2024-02-29 15:49:34 · entry 3548 of 3617 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-103&studentDocumentHistoryId=entry-310)

```
1. 2024-02-29 15:49:34, history start 3543, then no further edits
  Program Changes (5s)
    added a Sensor node
    set Sensor.type = fsr-reading
    set Sensor.sensor = SIMpressure_key
  Outside Program (no further edits, showing 120s)
    tested Target EMG x2
    sim: Gripper 0..100 x6, Surface Pressure 0..300 x6
```

### ep-162

- **date:** 2024-02-29
- **unit/problem:** brain 2
- **document:** `doc-106`
- **outputs:** none
- **ticks:** 1 of 1 pauses covered
- **cycles:** 1
- **changes:** 1 param
- **start:** 2024-02-29 15:42:47 · entry 1635 of 2190 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-106&studentDocumentHistoryId=entry-317)
- **end:** 2024-02-29 15:42:47 · entry 1635 of 2190 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-106&studentDocumentHistoryId=entry-317)

```
1. 2024-02-29 15:42:47, history start 1635, duration 57s
  Program Changes (0s)
    set ?.hubSelect = Simulated Gripper
  Outside Program (57s, present unknown)
    tested Target EMG x2
    sim: Gripper 0..100 x6, Surface Pressure 0..300 x6
```

### ep-164

- **date:** 2024-02-29
- **unit/problem:** brain 2
- **document:** `doc-107`
- **outputs:** none
- **ticks:** 1 of 1 pauses covered
- **cycles:** 1
- **changes:** 1 param
- **start:** 2024-02-29 15:48:01 · entry 599 of 678 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-107&studentDocumentHistoryId=entry-320)
- **end:** 2024-02-29 15:48:01 · entry 599 of 678 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-107&studentDocumentHistoryId=entry-320)

```
1. 2024-02-29 15:48:01, history start 599, duration 35s
  Program Changes (0s)
    set ?.hubSelect = Simulated Gripper
  Outside Program (35s, present unknown)
    sim: no change
```

### ep-168

- **date:** 2024-03-01
- **unit/problem:** brain 3
- **document:** `doc-109`
- **outputs:** none
- **ticks:** 1 of 1 pauses covered
- **cycles:** 1
- **changes:** 1 conn (Control)
- **start:** 2024-03-01 15:44:18 · entry 3262 of 8714 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-109&studentDocumentHistoryId=entry-327)
- **end:** 2024-03-01 15:44:18 · entry 3262 of 8714 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-109&studentDocumentHistoryId=entry-327)

```
1. 2024-03-01 15:44:18, history start 3262, duration 31s
  Program Changes (0s)
    connected Sensor -> Control (num1)
  Outside Program (31s, present unknown)
    sim: no change
```

### ep-176

- **date:** 2024-02-29
- **unit/problem:** brain 3
- **document:** `doc-110`
- **outputs:** none
- **ticks:** 1 of 1 pauses covered
- **cycles:** 1
- **changes:** 1 node, 1 conn, 1 param (Transform)
- **start:** 2024-02-29 16:15:03 · entry 1217 of 7206 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-110&studentDocumentHistoryId=entry-342)
- **end:** 2024-02-29 16:15:03 · entry 1264 of 7206 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-110&studentDocumentHistoryId=entry-343)

```
1. 2024-02-29 16:15:03, history start 1217, duration 51s
  Program Changes (24s)
    added a Transform node
    connected ? -> Transform (num1)
    set Transform.transformOperator = Ramp
  Outside Program (27s, watching)
    tested Target EMG x1
    sim: Gripper 9..50 x18
```

### ep-178

- **date:** 2024-02-29
- **unit/problem:** brain 3
- **document:** `doc-110`
- **outputs:** none
- **ticks:** 1 of 1 pauses covered
- **cycles:** 1
- **changes:** 1 conn (Control)
- **start:** 2024-02-29 16:19:57 · entry 1646 of 7206 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-110&studentDocumentHistoryId=entry-346)
- **end:** 2024-02-29 16:19:57 · entry 1646 of 7206 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-110&studentDocumentHistoryId=entry-346)

```
1. 2024-02-29 16:19:57, history start 1646, duration 64s
  Program Changes (0s)
    connected Sensor -> Control (num2)
  Outside Program (64s, present unknown)
    sim: Gripper 46..50 x30
```

### ep-180

- **date:** 2024-03-01
- **unit/problem:** brain 3
- **document:** `doc-110`
- **outputs:** none
- **ticks:** 1 of 1 pauses covered
- **cycles:** 1
- **changes:** 1 param
- **start:** 2024-03-01 15:52:53 · entry 3790 of 7206 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-110&studentDocumentHistoryId=entry-349)
- **end:** 2024-03-01 15:52:53 · entry 3790 of 7206 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-110&studentDocumentHistoryId=entry-349)

```
1. 2024-03-01 15:52:53, history start 3790, duration 68s
  Program Changes (0s)
    set ?.mathOperator = Divide
  Outside Program (68s, present unknown)
    tested Target EMG x1
    sim: no change
```

### ep-182

- **date:** 2024-03-01
- **unit/problem:** brain 3
- **document:** `doc-110`
- **outputs:** none
- **ticks:** 1 of 1 pauses covered
- **cycles:** 1
- **changes:** 1 param (Logic)
- **start:** 2024-03-01 16:08:53 · entry 4558 of 7206 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-110&studentDocumentHistoryId=entry-352)
- **end:** 2024-03-01 16:08:53 · entry 4558 of 7206 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-110&studentDocumentHistoryId=entry-352)

```
1. 2024-03-01 16:08:53, history start 4558, duration 76s
  Program Changes (0s)
    set Logic.logicOperator = Greater Than
  Outside Program (76s, present unknown)
    tested Target EMG x1
    sim: Gripper 59..90 x6, Surface Pressure 0..225 x6
```

### ep-193

- **date:** 2024-02-29
- **unit/problem:** brain 3
- **document:** `doc-110`
- **outputs:** none
- **ticks:** none during this episode (the document has some)
- **cycles:** 1
- **changes:** 1 conn (Transform)
- **start:** 2024-02-29 15:53:19 · entry 59 of 7206 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-110&studentDocumentHistoryId=entry-373)
- **end:** 2024-02-29 15:53:19 · entry 59 of 7206 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-110&studentDocumentHistoryId=entry-373)

```
1. 2024-02-29 15:53:19, history start 59, duration 4m 12s
  Program Changes (0s)
    connected Generator -> Transform (num1)
  Outside Program (4m 12s, documenting)
    sim: not running
```

## trial_and_error — strong (15 shown)

### ep-002

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-001`
- **outputs:** Demo Output Light Bulb
- **ticks:** none -- this document has no tick data at all
- **cycles:** 8
- **changes:** 28 node, 24 conn, 5 param
- **start:** 2024-02-05 18:30:37 · entry 159 of 600 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-001&studentDocumentHistoryId=entry-003)
- **end:** 2024-02-05 18:49:00 · entry 541 of 600 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-001&studentDocumentHistoryId=entry-004)

```
1. 2024-02-05 18:30:37, history start 159, duration 97s
  Program Changes (50s, 4 targets)
    added a Demo Output node
    deleted the Transform node
    added a Logic node
    added a Generator node
    connected Generator -> Demo Output (nodeValue)
  Outside Program (47s, watching weak)
    sim: not running
2. 2024-02-05 18:32:14, history start 174, duration 2m 52s
  Program Changes (116s, 2 targets)
    connected Math -> Logic (num1)
    connected Number -> Logic (num2)
    disconnected the nodeValue input of Demo Output
    connected Logic -> Demo Output (nodeValue)
    disconnected the nodeValue input of Demo Output
    connected Generator -> Demo Output (nodeValue)
    disconnected the nodeValue input of Demo Output
    connected Logic -> Demo Output (nodeValue)
    disconnected the num1 input of Logic
    connected Generator -> Logic (num1)
  Outside Program (56s, present unknown)
    sim: not running
3. 2024-02-05 18:35:06, history start 201, duration 81s
  Program Changes (54s, 8 targets)
    deleted the Demo Output node
    deleted the Logic node
    deleted the Generator node
    deleted the Math node
    deleted the Number node
    deleted the Number node
    added a Demo Output node
    added a Sensor node
  Outside Program (27s, watching weak)
    sim: not running
4. 2024-02-05 18:36:27, history start 217, duration 84s
  Program Changes (33s, 2 targets)
    set Sensor.type = O2
    set Sensor.sensor = 00004-VIR
    set Sensor.virtual = true
    connected Sensor -> Demo Output (nodeValue)
    disconnected the nodeValue input of Demo Output
  Outside Program (51s, present unknown)
    sim: not running
5. 2024-02-05 18:37:51, history start 224, duration 100s
  Program Changes (61s, 5 targets)
    added a Math node
    connected Math -> Demo Output (nodeValue)
    disconnected the nodeValue input of Demo Output
    connected Sensor -> Demo Output (nodeValue)
    deleted the Math node
    added a Logic node
    added a Number node
    connected Number -> Logic (num1)
    added a Number node
    connected Number -> Logic (num2)
  Outside Program (38s, present unknown)
    sim: not running
6. 2024-02-05 18:39:31, history start 264, duration 33s
  Program Changes (4s, 3 targets)
    deleted the Logic node
    deleted the Number node
    deleted the Number node
  Outside Program (29s, present unknown)
    sim: not running
7. 2024-02-05 18:40:04, history start 280, duration 8m 56s
  Program Changes (34s, 3 targets)
    added a Demo Output node
    deleted the Demo Output node
    added a Timer node
    deleted the Timer node
    added a Logic node
    deleted the Logic node
  Outside Program (8m 22s, long)
    sim: not running
8. 2024-02-05 18:49:00, history start 515, then no further edits
  Program Changes (76s, 3 targets)
    added a Number node
    added a Logic node
    connected Number -> Logic (num2)
    connected Sensor -> Logic (num1)
    disconnected the nodeValue input of Demo Output
    connected Logic -> Demo Output (nodeValue)
    disconnected the nodeValue input of Demo Output
    connected Logic -> Demo Output (nodeValue)
    set Logic.logicOperator = Less Than
    set Logic.logicOperator = Greater Than
  Outside Program (no further edits, showing 120s)
    sim: not running
```

### ep-007

- **date:** 2024-03-01
- **unit/problem:** brain 1
- **document:** `doc-003`
- **outputs:** Demo Output Light Bulb, Live Output Physical Gripper
- **ticks:** none -- this document has no tick data at all
- **cycles:** 5
- **changes:** 27 node, 16 conn, 9 param
- **start:** 2024-03-01 16:13:28 · entry 1595 of 2300 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-003&studentDocumentHistoryId=entry-012)
- **end:** 2024-03-01 16:29:31 · entry 2204 of 2300 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-003&studentDocumentHistoryId=entry-013)

```
1. 2024-03-01 16:13:28, history start 1595, duration 3m 22s
  Program Changes (2m 46s, 23 targets)
    deleted the Timer node
    deleted the Generator node
    deleted the Demo Output node
    deleted the Demo Output node
    deleted the Transform node
    deleted the Transform node
    deleted the Logic node
    deleted the Sensor node
    deleted the Number node
    deleted the Logic node
    deleted the Sensor node
    deleted the Number node
    added a Sensor node
    added a Number node
    added a Math node
    set Math.mathOperator = Divide
    connected Number -> Math (num2)
    connected Sensor -> Math (num1)
    added a Transform node
    connected Math -> Transform (num1)
    added a Logic node
    added a Number node
    connected Number -> Logic (num2)
    connected Sensor -> Logic (num1)
    added a Sensor node
    added a Number node
    added a Logic node
    connected Sensor -> Logic (num1)
    connected Number -> Logic (num2)
    added a Logic node
    set Logic.logicOperator = And
    connected Logic -> Logic (num2)
    connected Logic -> Logic (num1)
    added a Control node
    connected Logic -> Control (num1)
    connected Transform -> Control (num2)
    set Transform.transformOperator = Ramp
  Outside Program (37s, present unknown)
    sim: not running
2. 2024-03-01 16:16:50, history start 1838, duration 30s
  Program Changes (0s)
    set Sensor.type = fsr-reading
  Outside Program (30s, present unknown)
    sim: not running
3. 2024-03-01 16:17:20, history start 1852, duration 10m 28s
  Program Changes (62s, 4 targets)
    set Sensor.type = emg-reading
    set Sensor.sensor = emg
    set Sensor.sensor = fsr
    added a Demo Output node
    deleted the Demo Output node
    added a Live Output node
    set Live Output.hubSelect = Physical Gripper
    connected Control -> Live Output (nodeValue)
    set Sensor.plot = true
  Outside Program (9m 27s, long)
    sim: not running
4. 2024-03-01 16:27:49, history start 2151, duration 102s
  Program Changes (20s, 2 targets)
    disconnected the nodeValue input of Live Output
    added a Number node
    connected Number -> Live Output (nodeValue)
  Outside Program (82s, present unknown)
    sim: not running
5. 2024-03-01 16:29:31, history start 2202, duration 92s
  Program Changes (4s)
    disconnected the nodeValue input of Live Output
    connected Control -> Live Output (nodeValue)
  Outside Program (88s, absent)
    sim: not running
```

### ep-011

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-004`
- **outputs:** Demo Output Light Bulb
- **ticks:** none -- this document has no tick data at all
- **cycles:** 6
- **changes:** 18 node, 16 conn, 10 param
- **start:** 2024-02-05 18:26:14 · entry 170 of 692 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-004&studentDocumentHistoryId=entry-020)
- **end:** 2024-02-05 18:39:01 · entry 408 of 692 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-004&studentDocumentHistoryId=entry-021)

```
1. 2024-02-05 18:26:14, history start 170, duration 2m 5s
  Program Changes (46s, 5 targets)
    deleted the Sensor node
    added a Number node
    deleted the Number node
    added a Math node
    deleted the Math node
    added a Number node
    added a Math node
    connected Number -> Math (num1)
  Outside Program (79s, present unknown)
    sim: not running
2. 2024-02-05 18:28:19, history start 263, duration 6m 46s
  Program Changes (12s)
    disconnected the num2 input of Math
    connected Number -> Math (num1)
    connected Number -> Math (num2)
    disconnected the num2 input of Math
    connected Number -> Math (num1)
    connected Number -> Math (num2)
  Outside Program (6m 34s, long)
    sim: not running
3. 2024-02-05 18:35:05, history start 294, duration 68s
  Program Changes (16s, 4 targets)
    disconnected the num1 input of Math
    deleted the Number node
    deleted the Number node
    deleted the Math node
    added a Demo Output node
  Outside Program (53s, present unknown)
    sim: not running
4. 2024-02-05 18:36:14, history start 318, duration 40s
  Program Changes (12s)
    added a Sensor node
    set Sensor.type = O2
    set Sensor.sensor = 00004-VIR
    set Sensor.virtual = true
  Outside Program (28s, present unknown)
    sim: not running
5. 2024-02-05 18:36:53, history start 324, duration 2m 8s
  Program Changes (95s, 5 targets)
    connected Sensor -> Demo Output (nodeValue)
    set Demo Output.plot = true
    set Demo Output.plot = false
    set Sensor.plot = true
    set Demo Output.plot = true
    deleted the Demo Output node
    added a Demo Output node
    added a Number node
    added a Math node
    connected Sensor -> Math (num1)
    connected Number -> Math (num2)
    connected Math -> Demo Output (nodeValue)
  Outside Program (33s, present unknown)
    sim: not running
6. 2024-02-05 18:39:01, history start 389, then no further edits
  Program Changes (68s, 3 targets)
    disconnected the nodeValue input of Demo Output
    deleted the Math node
    added a Logic node
    connected Sensor -> Logic (num1)
    connected Number -> Logic (num2)
    set Logic.logicOperator = Less Than
    set Logic.logicOperator = Greater Than
    set Logic.logicOperator = Equal
    connected Logic -> Demo Output (nodeValue)
  Outside Program (no further edits, showing 120s)
    sim: not running
```

### ep-015

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-007`
- **outputs:** Demo Output Light Bulb
- **ticks:** none -- this document has no tick data at all
- **cycles:** 5
- **changes:** 18 node, 11 conn, 1 param
- **start:** 2024-02-05 18:27:10 · entry 122 of 356 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-007&studentDocumentHistoryId=entry-028)
- **end:** 2024-02-05 18:35:34 · entry 188 of 356 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-007&studentDocumentHistoryId=entry-029)

```
1. 2024-02-05 18:27:10, history start 122, duration 71s
  Program Changes (35s, 4 targets)
    added a Number node
    added a Number node
    deleted the Number node
    added a Math node
    added a Number node
  Outside Program (37s, present unknown)
    sim: not running
2. 2024-02-05 18:28:22, history start 137, duration 65s
  Program Changes (4s)
    connected Number -> Math (num1)
    connected Number -> Math (num2)
  Outside Program (61s, present unknown)
    sim: not running
3. 2024-02-05 18:29:27, history start 142, duration 90s
  Program Changes (59s, 8 targets)
    deleted the Math node
    deleted the Number node
    set Number.plot = true
    deleted the Number node
    added a Logic node
    added a Demo Output node
    added a Generator node
    added a Generator node
    deleted the Generator node
    added a Number node
  Outside Program (31s, present unknown)
    sim: not running
4. 2024-02-05 18:30:57, history start 174, duration 4m 38s
  Program Changes (33s, 2 targets)
    connected Generator -> Logic (num2)
    connected Logic -> Demo Output (nodeValue)
    connected Number -> Logic (num1)
    connected Number -> Demo Output (nodeValue)
    disconnected the nodeValue input of Demo Output
    disconnected the nodeValue input of Demo Output
    connected Logic -> Demo Output (nodeValue)
  Outside Program (4m 4s, present unknown)
    sim: not running
5. 2024-02-05 18:35:34, history start 182, duration 47s
  Program Changes (9s, 4 targets)
    disconnected the num1 input of Logic
    deleted the Number node
    deleted the Generator node
    disconnected the nodeValue input of Demo Output
    deleted the Logic node
    deleted the Demo Output node
  Outside Program (38s, present unknown)
    sim: not running
```

### ep-018

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-008`
- **outputs:** Demo Output Light Bulb, Live Output ⚠️ connect device
- **ticks:** none -- this document has no tick data at all
- **cycles:** 4
- **changes:** 20 node, 6 conn, 7 param
- **start:** 2024-02-05 18:25:19 · entry 290 of 676 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-008&studentDocumentHistoryId=entry-034)
- **end:** 2024-02-05 18:44:07 · entry 417 of 676 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-008&studentDocumentHistoryId=entry-035)

```
1. 2024-02-05 18:25:19, history start 290, duration 9m 44s
  Program Changes (59s, 5 targets)
    added a Math node
    set Math.plot = true
    set Math.plot = false
    added a Live Output node
    set Live Output.hubSelect = ⚠️ connect device
    deleted the Live Output node
    added a Generator node
    added a Number node
    deleted the Generator node
    connected Number -> Math (num2)
    added a Number node
    connected Number -> Math (num1)
  Outside Program (8m 45s, long)
    sim: not running
2. 2024-02-05 18:35:03, history start 351, duration 48s
  Program Changes (19s, 4 targets)
    disconnected the num1 input of Math
    deleted the Number node
    deleted the Math node
    deleted the Number node
    added a Demo Output node
  Outside Program (29s, present unknown)
    sim: not running
3. 2024-02-05 18:35:51, history start 358, duration 8m 16s
  Program Changes (83s, 5 targets)
    added a Sensor node
    set Sensor.type = O2
    set Sensor.sensor = 00004-VIR
    set Sensor.virtual = true
    added a Transform node
    deleted the Transform node
    added a Logic node
    set Logic.logicOperator = Equal
    added a Number node
    connected Number -> Logic (num2)
    connected Sensor -> Logic (num1)
    connected Logic -> Demo Output (nodeValue)
  Outside Program (6m 53s, long)
    sim: not running
4. 2024-02-05 18:44:07, history start 408, then no further edits
  Program Changes (12s, 2 targets)
    added a Transform node
    deleted the Transform node
    added a Control node
    deleted the Control node
  Outside Program (no further edits, showing 120s)
    sim: not running
```

### ep-019

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-009`
- **outputs:** Demo Output Light Bulb
- **ticks:** none -- this document has no tick data at all
- **cycles:** 4
- **changes:** 8 node, 14 conn, 18 param
- **start:** 2024-02-05 18:38:12 · entry 338 of 680 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-009&studentDocumentHistoryId=entry-036)
- **end:** 2024-02-05 18:43:49 · entry 439 of 680 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-009&studentDocumentHistoryId=entry-037)

```
1. 2024-02-05 18:38:12, history start 338, duration 2m 14s
  Program Changes (98s, 5 targets)
    added a Sensor node
    added a Demo Output node
    set Sensor.type = temperature
    set Sensor.sensor = tmp
    set Sensor.sensor = 00001-VIR
    set Sensor.virtual = true
    connected Sensor -> Demo Output (nodeValue)
    set Sensor.type = O2
    set Sensor.sensor = none
    set Sensor.virtual = false
    disconnected the nodeValue input of Demo Output
    deleted the Sensor node
    added a Sensor node
    set Sensor.type = light
    set Sensor.sensor = 00005-VIR
    set Sensor.virtual = true
    deleted the Sensor node
    added a Sensor node
    set Sensor.type = O2
    set Sensor.sensor = 00004-VIR
    set Sensor.virtual = true
    connected Sensor -> Demo Output (nodeValue)
    added a Logic node
    disconnected the nodeValue input of Demo Output
    connected Sensor -> Logic (num1)
  Outside Program (35s, present unknown)
    sim: not running
2. 2024-02-05 18:40:26, history start 390, duration 105s
  Program Changes (31s, 3 targets)
    connected Logic -> Demo Output (nodeValue)
    added a Number node
    disconnected the num1 input of Logic
    connected Sensor -> Logic (num1)
    disconnected the num1 input of Logic
    connected Sensor -> Logic (num2)
    connected Number -> Logic (num1)
  Outside Program (74s, present unknown)
    sim: not running
3. 2024-02-05 18:42:11, history start 414, duration 97s
  Program Changes (43s)
    set Logic.logicOperator = Less Than
    set Logic.logicOperator = Less Than Or Equal To
    set Logic.logicOperator = Equal
    set Logic.logicOperator = Not Equal
    set Logic.logicOperator = Less Than
  Outside Program (54s, present unknown)
    sim: not running
4. 2024-02-05 18:43:49, history start 434, then no further edits
  Program Changes (3s)
    disconnected the num1 input of Logic
    connected Number -> Logic (num2)
    connected Sensor -> Logic (num1)
  Outside Program (no further edits, showing 120s)
    sim: not running
```

### ep-022

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-010`
- **outputs:** Demo Output Light Bulb
- **ticks:** none -- this document has no tick data at all
- **cycles:** 5
- **changes:** 20 node, 49 conn, 10 param
- **start:** 2024-02-05 18:25:39 · entry 84 of 503 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-010&studentDocumentHistoryId=entry-042)
- **end:** 2024-02-05 18:41:45 · entry 307 of 503 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-010&studentDocumentHistoryId=entry-043)

```
1. 2024-02-05 18:25:39, history start 84, duration 9m 25s
  Program Changes (87s, 6 targets)
    added a Number node
    added a Sensor node
    deleted the Sensor node
    added a Number node
    added a Math node
    deleted the Number node
    deleted the Number node
    added a Number node
    set Math.plot = true
    connected Number -> Math (num2)
    added a Number node
    connected Number -> Math (num1)
  Outside Program (7m 59s, long)
    sim: not running
2. 2024-02-05 18:35:04, history start 140, duration 105s
  Program Changes (52s, 6 targets)
    disconnected the num1 input of Math
    deleted the Number node
    deleted the Number node
    deleted the Math node
    added a Logic node
    deleted the Logic node
    added a Demo Output node
    added a Sensor node
  Outside Program (53s, present unknown)
    sim: not running
3. 2024-02-05 18:36:49, history start 157, duration 4m 20s
  Program Changes (3m 47s, 4 targets)
    set Sensor.type = O2
    set Sensor.sensor = 00004-VIR
    set Sensor.virtual = true
    added a Logic node
    connected Sensor -> Logic (num2)
    connected Logic -> Demo Output (nodeValue)
    disconnected the num2 input of Logic
    connected Sensor -> Logic (num1)
    disconnected the num1 input of Logic
    connected Sensor -> Logic (num1)
    set Logic.logicOperator = Less Than
    disconnected the num1 input of Logic
    connected Sensor -> Logic (num2)
    disconnected the num2 input of Logic
    connected Sensor -> Logic (num1)
    disconnected the num1 input of Logic
    connected Sensor -> Logic (num2)
    disconnected the num2 input of Logic
    connected Sensor -> Demo Output (nodeValue)
    disconnected the nodeValue input of Demo Output
    connected Logic -> Demo Output (nodeValue)
    disconnected the nodeValue input of Demo Output
    connected Logic -> Demo Output (nodeValue)
    connected Sensor -> Logic (num1)
    set Logic.logicOperator = Greater Than
    added a Sensor node
    set Sensor.type = O2
    set Sensor.sensor = 00004-VIR
    set Sensor.virtual = true
    connected Sensor -> Logic (num2)
    disconnected the num2 input of Logic
    connected Sensor -> Logic (num2)
    disconnected the num2 input of Logic
    deleted the Sensor node
    set Logic.logicOperator = Less Than
    disconnected the num1 input of Logic
    disconnected the nodeValue input of Demo Output
    connected Logic -> Demo Output (nodeValue)
    connected Sensor -> Logic (num1)
    disconnected the num1 input of Logic
    connected Sensor -> Logic (num2)
    disconnected the num2 input of Logic
    connected Sensor -> Logic (num1)
    disconnected the num1 input of Logic
  Outside Program (33s, reading)
    sim: not running
4. 2024-02-05 18:41:09, history start 274, duration 36s
  Program Changes (4s)
    connected Sensor -> Logic (num1)
    disconnected the num1 input of Logic
    connected Sensor -> Logic (num2)
  Outside Program (32s, reading)
    sim: not running
5. 2024-02-05 18:41:45, history start 284, then no further edits
  Program Changes (47s, 3 targets)
    connected Sensor -> Logic (num2)
    disconnected the nodeValue input of Demo Output
    connected Logic -> Demo Output (nodeValue)
    disconnected the nodeValue input of Demo Output
    connected Logic -> Demo Output (nodeValue)
    added a Number node
    connected Number -> Logic (num2)
    disconnected the num2 input of Logic
    connected Sensor -> Logic (num1)
    connected Number -> Logic (num1)
    disconnected the num1 input of Logic
    connected Sensor -> Logic (num2)
  Outside Program (no further edits, showing 120s)
    sim: not running
```

### ep-025

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-011`
- **outputs:** none
- **ticks:** none -- this document has no tick data at all
- **cycles:** 4
- **changes:** 2 node, 13 conn, 3 param (Number)
- **start:** 2024-02-05 18:30:22 · entry 263 of 844 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-011&studentDocumentHistoryId=entry-048)
- **end:** 2024-02-05 18:33:11 · entry 294 of 844 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-011&studentDocumentHistoryId=entry-049)

```
1. 2024-02-05 18:30:22, history start 263, duration 56s
  Program Changes (31s, 2 targets)
    connected ? -> ? (num2)
    disconnected the num2 input of ?
    connected ? -> ? (num2)
    connected ? -> ? (num1)
    connected ? -> ? (nodeValue)
    disconnected the num2 input of ?
    connected ? -> ? (num2)
  Outside Program (25s, present unknown)
    sim: not running
2. 2024-02-05 18:31:18, history start 278, duration 57s
  Program Changes (15s, 2 targets)
    added a Number node
    connected Number -> ? (num2)
  Outside Program (43s, present unknown)
    sim: not running
3. 2024-02-05 18:32:16, history start 283, duration 55s
  Program Changes (29s)
    set ?.logicOperator = Greater Than Or Equal To
    set ?.logicOperator = Less Than
    set ?.logicOperator = Greater Than
    disconnected the num2 input of ?
    disconnected the num1 input of ?
    connected Number -> ? (num1)
  Outside Program (27s, present unknown)
    sim: not running
4. 2024-02-05 18:33:11, history start 291, then no further edits
  Program Changes (6s, 2 targets)
    disconnected the num1 input of ?
    deleted the Number node
    connected ? -> ? (num1)
  Outside Program (no further edits, showing 120s)
    sim: not running
```

### ep-029

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-013`
- **outputs:** Demo Output Light Bulb
- **ticks:** none -- this document has no tick data at all
- **cycles:** 4
- **changes:** 18 node, 8 conn, 5 param
- **start:** 2024-02-05 18:25:26 · entry 315 of 1545 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-013&studentDocumentHistoryId=entry-056)
- **end:** 2024-02-05 18:36:57 · entry 911 of 1545 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-013&studentDocumentHistoryId=entry-057)

```
1. 2024-02-05 18:25:26, history start 315, duration 9m 43s
  Program Changes (74s, 7 targets)
    added a Number node
    deleted the Number node
    added a Number node
    added a Logic node
    added a Logic node
    deleted the Logic node
    deleted the Number node
    deleted the Logic node
    added a Math node
    set Math.plot = true
    added a Number node
    added a Number node
    connected Number -> Math (num2)
    connected Number -> Math (num1)
  Outside Program (8m 29s, long)
    sim: not running
2. 2024-02-05 18:35:09, history start 806, duration 64s
  Program Changes (9s, 4 targets)
    disconnected the num1 input of Math
    deleted the Number node
    deleted the Number node
    deleted the Math node
    added a Demo Output node
  Outside Program (55s, present unknown)
    sim: not running
3. 2024-02-05 18:36:13, history start 849, duration 44s
  Program Changes (5s)
    added a Sensor node
    set Sensor.type = O2
    set Sensor.sensor = 00004-VIR
    set Sensor.virtual = true
  Outside Program (40s, present unknown)
    sim: not running
4. 2024-02-05 18:36:57, history start 856, then no further edits
  Program Changes (56s, 3 targets)
    added a Logic node
    added a Number node
    set Logic.logicOperator = Less Than
    connected Sensor -> Logic (num1)
    connected Number -> Logic (num2)
    connected Logic -> Demo Output (nodeValue)
    disconnected the num2 input of Logic
    connected Number -> Logic (num2)
  Outside Program (no further edits, showing 120s)
    sim: not running
```

### ep-030

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-014`
- **outputs:** Demo Output Light Bulb
- **ticks:** none -- this document has no tick data at all
- **cycles:** 5
- **changes:** 11 node, 14 conn, 11 param
- **start:** 2024-02-05 18:25:38 · entry 285 of 1015 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-014&studentDocumentHistoryId=entry-058)
- **end:** 2024-02-05 18:39:31 · entry 573 of 1015 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-014&studentDocumentHistoryId=entry-059)

```
1. 2024-02-05 18:25:38, history start 285, duration 10m
  Program Changes (67s, 3 targets)
    added a Math node
    set Math.plot = true
    set Math.plot = true
    set Math.plot = true
    added a Number node
    added a Number node
    connected Number -> Math (num2)
  Outside Program (8m 53s, long)
    sim: not running
2. 2024-02-05 18:35:39, history start 430, duration 29s
  Program Changes (0s)
    added a Number node
  Outside Program (29s, present unknown)
    sim: not running
3. 2024-02-05 18:36:08, history start 435, duration 2m 17s
  Program Changes (99s, 7 targets)
    deleted the Number node
    added a Demo Output node
    added a Sensor node
    set Sensor.type = CO2
    set Sensor.sensor = 00003-VIR
    set Sensor.virtual = true
    set Sensor.type = O2
    set Sensor.sensor = none
    set Sensor.virtual = false
    set Sensor.sensor = 00004-VIR
    set Sensor.virtual = true
    added a Logic node
    added a Logic node
    connected Sensor -> Logic (num1)
    connected Logic -> Demo Output (nodeValue)
    added a Timer node
    added a Number node
    connected Number -> Logic (num2)
  Outside Program (38s, present unknown)
    sim: not running
4. 2024-02-05 18:38:24, history start 508, duration 67s
  Program Changes (32s)
    disconnected the num1 input of Logic
    disconnected the num2 input of Logic
    connected Number -> Logic (num2)
    disconnected the num2 input of Logic
    connected Number -> Logic (num1)
    connected Sensor -> Logic (num2)
  Outside Program (35s, present unknown)
    sim: not running
5. 2024-02-05 18:39:31, history start 560, duration 36s
  Program Changes (10s)
    disconnected the num2 input of Logic
    disconnected the num1 input of Logic
    connected Number -> Logic (num2)
    connected Sensor -> Logic (num1)
  Outside Program (26s, present unknown)
    sim: not running
```

### ep-031

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-015`
- **outputs:** Demo Output Light Bulb
- **ticks:** none -- this document has no tick data at all
- **cycles:** 6
- **changes:** 24 node, 31 conn, 6 param
- **start:** 2024-02-05 18:26:46 · entry 258 of 921 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-015&studentDocumentHistoryId=entry-060)
- **end:** 2024-02-05 18:44:00 · entry 476 of 921 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-015&studentDocumentHistoryId=entry-061)

```
1. 2024-02-05 18:26:46, history start 258, duration 9m 20s
  Program Changes (100s, 7 targets)
    added a Number node
    added a Number node
    added a Math node
    set Math.plot = true
    deleted the Number node
    deleted the Number node
    deleted the Math node
    added a Math node
    set Math.plot = true
    deleted the Math node
    added a Number node
    added a Number node
    added a Math node
    connected Number -> Math (num1)
    connected Number -> Math (num2)
  Outside Program (7m 40s, long)
    sim: not running
2. 2024-02-05 18:36:06, history start 319, duration 59s
  Program Changes (18s, 4 targets)
    disconnected the num2 input of Math
    deleted the Number node
    deleted the Math node
    deleted the Number node
    added a Demo Output node
  Outside Program (41s, present unknown)
    sim: not running
3. 2024-02-05 18:37:05, history start 328, duration 52s
  Program Changes (15s)
    added a Sensor node
    set Sensor.type = O2
    set Sensor.sensor = 00004-VIR
    set Sensor.virtual = true
  Outside Program (37s, present unknown)
    sim: not running
4. 2024-02-05 18:37:57, history start 340, duration 3m 28s
  Program Changes (3m 3s, 5 targets)
    connected Sensor -> Demo Output (nodeValue)
    disconnected the nodeValue input of Demo Output
    added a Transform node
    deleted the Transform node
    added a Logic node
    set Logic.plot = true
    connected Sensor -> Logic (num2)
    disconnected the num2 input of Logic
    connected Logic -> Demo Output (nodeValue)
    connected Sensor -> Logic (num2)
    added a Number node
    disconnected the num2 input of Logic
    connected Number -> Logic (num2)
    connected Sensor -> Logic (num1)
    disconnected the num2 input of Logic
    added a Number node
    disconnected the nodeValue input of Demo Output
    connected Number -> Logic (num2)
    connected Number -> Logic (num1)
    connected Sensor -> Demo Output (nodeValue)
    disconnected the nodeValue input of Demo Output
    disconnected the num2 input of Logic
    connected Number -> Logic (num2)
    disconnected the num1 input of Logic
    connected Number -> Logic (num2)
    connected Number -> Logic (num1)
    connected Logic -> Demo Output (nodeValue)
    disconnected the nodeValue input of Demo Output
    connected Logic -> Logic (num2)
    disconnected the num2 input of Logic
  Outside Program (26s, present unknown)
    sim: not running
5. 2024-02-05 18:41:26, history start 453, duration 2m 34s
  Program Changes (2s, 2 targets)
    deleted the Number node
    deleted the Number node
  Outside Program (2m 32s, reading)
    sim: not running
6. 2024-02-05 18:44:00, history start 466, duration 59s
  Program Changes (21s, 3 targets)
    added a Number node
    connected Number -> Logic (num2)
    disconnected the num2 input of Logic
    connected Sensor -> Logic (num1)
    connected Logic -> Demo Output (nodeValue)
  Outside Program (38s, present unknown)
    sim: not running
```

### ep-037

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-017`
- **outputs:** Demo Output Light Bulb
- **ticks:** none -- this document has no tick data at all
- **cycles:** 8
- **changes:** 15 node, 16 conn, 12 param
- **start:** 2024-02-05 18:31:50 · entry 332 of 855 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-017&studentDocumentHistoryId=entry-072)
- **end:** 2024-02-05 18:41:17 · entry 648 of 855 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-017&studentDocumentHistoryId=entry-073)

```
1. 2024-02-05 18:31:50, history start 332, duration 72s
  Program Changes (19s, 2 targets)
    deleted the Sensor node
    added a Sensor node
    deleted the Sensor node
  Outside Program (54s, present unknown)
    sim: not running
2. 2024-02-05 18:33:02, history start 337, duration 60s
  Program Changes (12s, 2 targets)
    connected Math -> Demo Output (nodeValue)
    added a Timer node
  Outside Program (48s, present unknown)
    sim: not running
3. 2024-02-05 18:34:03, history start 461, duration 46s
  Program Changes (18s, 2 targets)
    disconnected the num2 input of Math
    connected Timer -> Math (num2)
    set Timer.timeOn = 1
    set Timer.timeOff = 1
  Outside Program (28s, present unknown)
    sim: not running
4. 2024-02-05 18:34:49, history start 493, duration 77s
  Program Changes (0s)
    connected Math -> Math (num1)
    disconnected the num1 input of Math
  Outside Program (77s, present unknown)
    sim: not running
5. 2024-02-05 18:36:06, history start 514, duration 2m 55s
  Program Changes (68s, 6 targets)
    set Math.plot = true
    disconnected the nodeValue input of Demo Output
    deleted the Math node
    deleted the Number node
    deleted the Number node
    deleted the Timer node
    added a Sensor node
    set Sensor.type = soil-moisture
    set Sensor.type = light
    set Sensor.type = O2
    connected Sensor -> Demo Output (nodeValue)
    disconnected the nodeValue input of Demo Output
    set Sensor.sensor = 00004-VIR
    set Sensor.virtual = true
    connected Sensor -> Demo Output (nodeValue)
  Outside Program (106s, present unknown)
    sim: not running
6. 2024-02-05 18:39:01, history start 548, duration 71s
  Program Changes (26s, 3 targets)
    added a Sensor node
    added a Sensor node
    deleted the Sensor node
    set Sensor.type = O2
    set Sensor.sensor = 00004-VIR
    set Sensor.virtual = true
    disconnected the nodeValue input of Demo Output
    connected Sensor -> Demo Output (nodeValue)
    connected Sensor -> Demo Output (nodeValue)
    disconnected the nodeValue input of Demo Output
    set Demo Output.plot = true
  Outside Program (45s, present unknown)
    sim: not running
7. 2024-02-05 18:40:12, history start 591, duration 65s
  Program Changes (12s)
    connected Sensor -> Demo Output (nodeValue)
    connected Sensor -> Demo Output (nodeValue)
    disconnected the nodeValue input of Demo Output
  Outside Program (54s, present unknown)
    sim: not running
8. 2024-02-05 18:41:17, history start 635, duration 77s
  Program Changes (20s, 2 targets)
    deleted the Demo Output node
    added a Timer node
    deleted the Timer node
  Outside Program (56s, present unknown)
    sim: not running
```

### ep-039

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-018`
- **outputs:** Demo Output Light Bulb
- **ticks:** none -- this document has no tick data at all
- **cycles:** 5
- **changes:** 12 node, 29 conn, 3 param
- **start:** 2024-02-05 18:25:33 · entry 90 of 517 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-018&studentDocumentHistoryId=entry-076)
- **end:** 2024-02-05 18:36:58 · entry 231 of 517 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-018&studentDocumentHistoryId=entry-077)

```
1. 2024-02-05 18:25:33, history start 90, duration 2m 44s
  Program Changes (31s, 3 targets)
    added a Math node
    added a Number node
    connected Number -> Math (num1)
    added a Number node
    connected Number -> Math (num2)
  Outside Program (2m 13s, present unknown)
    sim: not running
2. 2024-02-05 18:28:18, history start 109, duration 6m 45s
  Program Changes (13s)
    disconnected the num1 input of Math
    connected Number -> Math (num1)
    connected Number -> Math (num2)
    disconnected the num2 input of Math
    connected Number -> Math (num2)
    connected Number -> Math (num1)
  Outside Program (6m 32s, long)
    sim: not running
3. 2024-02-05 18:35:02, history start 136, duration 51s
  Program Changes (17s, 4 targets)
    disconnected the num1 input of Math
    deleted the Number node
    disconnected the num2 input of Math
    deleted the Number node
    deleted the Math node
    added a Demo Output node
  Outside Program (34s, present unknown)
    sim: not running
4. 2024-02-05 18:35:54, history start 147, duration 64s
  Program Changes (28s)
    added a Sensor node
    set Sensor.type = O2
    set Sensor.sensor = 00004-VIR
    set Sensor.virtual = true
  Outside Program (36s, present unknown)
    sim: not running
5. 2024-02-05 18:36:58, history start 158, then no further edits
  Program Changes (2m 39s, 4 targets)
    connected Sensor -> Demo Output (nodeValue)
    disconnected the nodeValue input of Demo Output
    added a Logic node
    connected Sensor -> Logic (num2)
    connected Logic -> Demo Output (nodeValue)
    disconnected the nodeValue input of Demo Output
    added a Number node
    disconnected the num2 input of Logic
    connected Number -> Logic (num2)
    connected Sensor -> Logic (num1)
    connected Logic -> Demo Output (nodeValue)
    disconnected the num1 input of Logic
    disconnected the nodeValue input of Demo Output
    added a Sensor node
    deleted the Sensor node
    connected Sensor -> Logic (num1)
    connected Logic -> Demo Output (nodeValue)
    disconnected the num1 input of Logic
    connected Number -> Logic (num1)
    disconnected the num1 input of Logic
    connected Sensor -> Logic (num1)
    disconnected the num2 input of Logic
    connected Number -> Logic (num1)
  Outside Program (no further edits, showing 120s)
    sim: not running
```

### ep-041

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-019`
- **outputs:** Demo Output Light Bulb
- **ticks:** none -- this document has no tick data at all
- **cycles:** 7
- **changes:** 27 node, 14 conn, 14 param
- **start:** 2024-02-05 18:25:29 · entry 199 of 496 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-019&studentDocumentHistoryId=entry-080)
- **end:** 2024-02-05 18:39:04 · entry 352 of 496 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-019&studentDocumentHistoryId=entry-081)

```
1. 2024-02-05 18:25:29, history start 199, duration 3m 40s
  Program Changes (2m 5s, 5 targets)
    added a Number node
    added a Generator node
    set Generator.generatorType = Triangle
    set Generator.generatorType = Square
    set Generator.amplitude = 2
    deleted the Generator node
    added a Math node
    connected Number -> Math (num1)
    added a Number node
    set Math.plot = true
    deleted the Math node
    added a Math node
    connected Number -> Math (num1)
    connected Number -> Math (num2)
  Outside Program (95s, present unknown)
    sim: not running
2. 2024-02-05 18:29:09, history start 245, duration 31s
  Program Changes (1s, 3 targets)
    disconnected the num1 input of Math
    deleted the Number node
    deleted the Number node
  Outside Program (30s, present unknown)
    sim: not running
3. 2024-02-05 18:29:40, history start 252, duration 5m 21s
  Program Changes (90s, 6 targets)
    added a Generator node
    deleted the Math node
    added a Number node
    added a Demo Output node
    added a Math node
    deleted the Math node
    added a Logic node
    connected Number -> Logic (num2)
    connected Logic -> Demo Output (nodeValue)
    connected Generator -> Logic (num1)
    set Generator.generatorType = Square
    set Logic.logicOperator = Less Than
  Outside Program (3m 51s, present unknown)
    sim: not running
4. 2024-02-05 18:35:01, history start 286, duration 28s
  Program Changes (3s, 4 targets)
    disconnected the num1 input of Logic
    deleted the Generator node
    disconnected the nodeValue input of Demo Output
    deleted the Logic node
    deleted the Demo Output node
    deleted the Number node
  Outside Program (25s, present unknown)
    sim: not running
5. 2024-02-05 18:35:29, history start 292, duration 54s
  Program Changes (0s)
    added a Demo Output node
  Outside Program (54s, present unknown)
    sim: not running
6. 2024-02-05 18:36:23, history start 296, duration 2m 41s
  Program Changes (107s, 6 targets)
    added a Sensor node
    set Sensor.type = O2
    set Sensor.sensor = 00004-VIR
    set Sensor.virtual = true
    added a Math node
    added a Logic node
    set Logic.logicOperator = Less Than
    added a Number node
    added a Number node
    connected Sensor -> Logic (num1)
    set Logic.logicOperator = Greater Than
    set Logic.logicOperator = Less Than
    connected Number -> Logic (num2)
    set Logic.logicOperator = Greater Than
    connected Logic -> Demo Output (nodeValue)
  Outside Program (54s, watching weak)
    sim: not running
7. 2024-02-05 18:39:04, history start 345, then no further edits
  Program Changes (8s, 2 targets)
    disconnected the num2 input of Logic
    deleted the Number node
    connected Number -> Logic (num2)
    set Logic.logicOperator = Less Than
  Outside Program (no further edits, showing 120s)
    sim: not running
```

### ep-042

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-020`
- **outputs:** Demo Output Light Bulb
- **ticks:** none -- this document has no tick data at all
- **cycles:** 6
- **changes:** 19 node, 10 conn, 11 param
- **start:** 2024-02-05 18:26:25 · entry 195 of 517 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-020&studentDocumentHistoryId=entry-082)
- **end:** 2024-02-05 18:36:53 · entry 355 of 517 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-020&studentDocumentHistoryId=entry-083)

```
1. 2024-02-05 18:26:25, history start 195, duration 56s
  Program Changes (27s, 3 targets)
    deleted the Number node
    added a Number node
    added a Number node
    set Number.plot = true
  Outside Program (29s, present unknown)
    sim: not running
2. 2024-02-05 18:27:22, history start 206, duration 110s
  Program Changes (45s, 4 targets)
    deleted the Number node
    added a Math node
    connected Number -> Math (num1)
    added a Number node
    connected Number -> Math (num2)
    set Math.plot = true
    set Number.plot = true
    set Number.plot = false
    set Number.plot = false
  Outside Program (65s, present unknown)
    sim: not running
3. 2024-02-05 18:29:12, history start 228, duration 6m 17s
  Program Changes (26s, 6 targets)
    disconnected the num1 input of Math
    deleted the Number node
    deleted the Number node
    deleted the Math node
    added a Number node
    added a Number node
    added a Math node
    connected Number -> Math (num1)
  Outside Program (5m 51s, long)
    sim: not running
4. 2024-02-05 18:35:29, history start 284, duration 25s
  Program Changes (0s)
    added a Demo Output node
  Outside Program (25s, present unknown)
    sim: not running
5. 2024-02-05 18:35:55, history start 291, duration 58s
  Program Changes (28s, 4 targets)
    added a Sensor node
    disconnected the num1 input of Math
    deleted the Number node
    deleted the Number node
    deleted the Math node
    set Sensor.type = O2
    set Sensor.sensor = 00004-VIR
    set Sensor.virtual = true
  Outside Program (30s, present unknown)
    sim: not running
6. 2024-02-05 18:36:53, history start 311, duration 107s
  Program Changes (72s, 3 targets)
    added a Number node
    added a Logic node
    connected Number -> Logic (num1)
    disconnected the num1 input of Logic
    connected Number -> Logic (num2)
    connected Sensor -> Logic (num1)
    connected Logic -> Demo Output (nodeValue)
    set Logic.logicOperator = Less Than
    set Logic.logicOperator = Greater Than Or Equal To
    set Logic.logicOperator = Greater Than
  Outside Program (35s, present unknown)
    sim: not running
```

## trial_and_error — boundary (15 shown)

### ep-001

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-001`
- **outputs:** none
- **ticks:** none -- this document has no tick data at all
- **cycles:** 2
- **changes:** 5 node, 4 conn, 1 param
- **start:** 2024-02-05 18:25:42 · entry 121 of 600 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-001&studentDocumentHistoryId=entry-001)
- **end:** 2024-02-05 18:26:40 · entry 146 of 600 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-001&studentDocumentHistoryId=entry-002)

```
1. 2024-02-05 18:25:42, history start 121, duration 57s
  Program Changes (26s, 4 targets)
    added a Number node
    added a Math node
    added a Generator node
    deleted the Generator node
    added a Number node
  Outside Program (31s, present unknown)
    sim: not running
2. 2024-02-05 18:26:40, history start 138, duration 52s
  Program Changes (23s, 2 targets)
    connected Number -> Math (num1)
    disconnected the num1 input of Math
    connected Number -> Math (num1)
    disconnected the num1 input of Math
    set Number.plot = true
  Outside Program (29s, present unknown)
    sim: not running
```

### ep-004

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-002`
- **outputs:** none
- **ticks:** none -- this document has no tick data at all
- **cycles:** 3
- **changes:** 15 node, 11 conn, 6 param
- **start:** 2024-02-05 18:26:13 · entry 180 of 742 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-002&studentDocumentHistoryId=entry-006)
- **end:** 2024-02-05 18:36:12 · entry 293 of 742 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-002&studentDocumentHistoryId=entry-007)

```
1. 2024-02-05 18:26:13, history start 180, duration 53s
  Program Changes (28s, 4 targets)
    added a Number node
    set Number.plot = true
    added a Number node
    added a Number node
    deleted the Number node
    connected Number -> Math (num1)
  Outside Program (25s, present unknown)
    sim: not running
2. 2024-02-05 18:27:06, history start 204, duration 9m 7s
  Program Changes (0s)
    connected Number -> Math (num2)
  Outside Program (9m 7s, long)
    sim: not running
3. 2024-02-05 18:36:12, history start 240, then no further edits
  Program Changes (2m 21s, 11 targets)
    deleted the ? node
    deleted the Math node
    deleted the Number node
    deleted the Number node
    deleted the ? node
    added a Sensor node
    set Sensor.type = O2
    added a Logic node
    added a Number node
    set Number.plot = true
    deleted the Number node
    connected ? -> Logic (num2)
    disconnected the num2 input of Logic
    connected ? -> Logic (num2)
    disconnected the num2 input of Logic
    connected ? -> Logic (num1)
    set Logic.logicOperator = Less Than
    added a Number node
    connected Number -> Logic (num2)
    connected Logic -> ? (nodeValue)
    set Sensor.sensor = 00004-VIR
    set Sensor.virtual = true
    disconnected the num1 input of Logic
    deleted the ? node
    connected Sensor -> Logic (num1)
  Outside Program (no further edits, showing 120s)
    sim: not running
```

### ep-006

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-003`
- **outputs:** Demo Output Light Bulb
- **ticks:** none -- this document has no tick data at all
- **cycles:** 2
- **changes:** 9 node, 6 conn, 5 param
- **start:** 2024-02-05 18:36:53 · entry 614 of 2300 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-003&studentDocumentHistoryId=entry-010)
- **end:** 2024-02-05 18:39:50 · entry 763 of 2300 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-003&studentDocumentHistoryId=entry-011)

```
1. 2024-02-05 18:36:53, history start 614, duration 2m 57s
  Program Changes (24s, 3 targets)
    added a Logic node
    added a Number node
    connected Number -> Logic (num2)
    connected Logic -> Demo Output (nodeValue)
    set Logic.logicOperator = Less Than
  Outside Program (2m 33s, reading)
    sim: not running
2. 2024-02-05 18:39:50, history start 652, duration 3m 14s
  Program Changes (90s, 6 targets)
    added a Demo Output node
    deleted the Demo Output node
    added a Sensor node
    set Sensor.type = O2
    set Sensor.sensor = 00004-VIR
    set Sensor.virtual = true
    added a Number node
    added a Logic node
    added a Transform node
    set Transform.transformOperator = Not
    connected Sensor -> Logic (num1)
    connected Number -> Logic (num2)
    connected Logic -> Transform (num1)
    added a Demo Output node
    connected Transform -> Demo Output (nodeValue)
  Outside Program (104s, present unknown)
    sim: not running
```

### ep-008

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-003`
- **outputs:** none
- **ticks:** none -- this document has no tick data at all
- **cycles:** 3
- **changes:** 3 node, 9 conn, 7 param
- **start:** 2024-02-05 18:30:30 · entry 498 of 2300 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-003&studentDocumentHistoryId=entry-014)
- **end:** 2024-02-05 18:32:17 · entry 527 of 2300 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-003&studentDocumentHistoryId=entry-015)

```
1. 2024-02-05 18:30:30, history start 498, duration 73s
  Program Changes (18s, 2 targets)
    connected ? -> ? (num2)
    connected ? -> ? (num1)
    connected ? -> ? (nodeValue)
    disconnected the num2 input of ?
    connected ? -> ? (num2)
    disconnected the num2 input of ?
    connected ? -> ? (num1)
    connected ? -> ? (num2)
  Outside Program (55s, present unknown)
    sim: not running
2. 2024-02-05 18:31:43, history start 509, duration 34s
  Program Changes (2s)
    set ?.generatorType = Triangle
    set ?.plot = true
  Outside Program (31s, present unknown)
    sim: not running
3. 2024-02-05 18:32:17, history start 512, duration 97s
  Program Changes (29s, 3 targets)
    added a Control node
    set Control.controlOperator = Output Zero
    set Control.controlOperator = Hold Current
    added a Demo Output node
    connected Control -> Demo Output (nodeValue)
    added a Sensor node
    set Sensor.type = light
    set Sensor.sensor = 00005-VIR
    set Sensor.virtual = true
  Outside Program (68s, present unknown)
    sim: not running
```

### ep-009

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-003`
- **outputs:** Demo Output Light Bulb
- **ticks:** none -- this document has no tick data at all
- **cycles:** 3
- **changes:** 20 node, 23 conn, 5 param
- **start:** 2024-02-05 18:22:57 · entry 280 of 2300 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-003&studentDocumentHistoryId=entry-016)
- **end:** 2024-02-05 18:28:28 · entry 486 of 2300 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-003&studentDocumentHistoryId=entry-017)

```
1. 2024-02-05 18:22:57, history start 280, duration 101s
  Program Changes (62s, 5 targets)
    added a Sensor node
    added a Number node
    added a Generator node
    set Generator.plot = true
    set Generator.plot = false
    added a Math node
    set Math.plot = false
    added a Logic node
  Outside Program (39s, present unknown)
    sim: not running
2. 2024-02-05 18:24:39, history start 305, duration 3m 49s
  Program Changes (3m 18s, 11 targets)
    added a Demo Output node
    connected Math -> Logic (num1)
    deleted the Logic node
    deleted the Generator node
    deleted the Sensor node
    deleted the Number node
    added a Number node
    added a Number node
    connected Number -> Math (num2)
    added a Logic node
    added a Sensor node
    set Demo Output.outputType = Grabber
    connected Math -> Demo Output (?)
    disconnected the ? input of Demo Output
    disconnected the ? input of Demo Output
    connected ? -> Demo Output (?)
    disconnected the ? input of Demo Output
    connected ? -> Demo Output (?)
    disconnected the ? input of Demo Output
    connected ? -> Demo Output (?)
    disconnected the ? input of Demo Output
    connected ? -> Demo Output (?)
    disconnected the ? input of Demo Output
    connected ? -> Demo Output (?)
    disconnected the ? input of Demo Output
    connected ? -> Demo Output (?)
    disconnected the ? input of Demo Output
    connected ? -> Demo Output (?)
    disconnected the ? input of Demo Output
    set Demo Output.outputType = Light Bulb
    disconnected the nodeValue input of Demo Output
    connected Math -> Logic (num1)
    added a Number node
    connected Number -> Logic (num2)
    connected Logic -> Demo Output (nodeValue)
  Outside Program (31s, present unknown)
    sim: not running
3. 2024-02-05 18:28:28, history start 473, then no further edits
  Program Changes (47s, 3 targets)
    added a Timer node
    added a Control node
    deleted the Control node
    deleted the Timer node
    added a Sensor node
  Outside Program (no further edits, showing 120s)
    sim: not running
```

### ep-016

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-007`
- **outputs:** Demo Output Light Bulb, Live Output unset
- **ticks:** none -- this document has no tick data at all
- **cycles:** 2
- **changes:** 12 node, 2 param
- **start:** 2024-02-05 18:39:19 · entry 221 of 356 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-007&studentDocumentHistoryId=entry-030)
- **end:** 2024-02-05 18:42:26 · entry 281 of 356 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-007&studentDocumentHistoryId=entry-031)

```
1. 2024-02-05 18:39:19, history start 221, duration 3m 7s
  Program Changes (46s, 5 targets)
    added a Number node
    set Number.plot = true
    deleted the Number node
    deleted the Math node
    added a Timer node
    deleted the Timer node
    added a Logic node
    deleted the Number node
  Outside Program (2m 21s, reading)
    sim: not running
2. 2024-02-05 18:42:26, history start 267, duration 3m 52s
  Program Changes (15s, 3 targets)
    added a Live Output node
    set Live Output.hubSelect = ⚠️ connect device
    deleted the Live Output node
    added a Control node
    deleted the Control node
    deleted the Logic node
  Outside Program (3m 37s, present unknown)
    sim: not running
```

### ep-017

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-008`
- **outputs:** none
- **ticks:** none -- this document has no tick data at all
- **cycles:** 2
- **changes:** 7 conn, 2 param
- **start:** 2024-02-05 18:32:07 · entry 334 of 676 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-008&studentDocumentHistoryId=entry-032)
- **end:** 2024-02-05 18:33:14 · entry 345 of 676 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-008&studentDocumentHistoryId=entry-033)

```
1. 2024-02-05 18:32:07, history start 334, duration 67s
  Program Changes (19s)
    disconnected the num2 input of ?
    connected ? -> ? (num2)
    disconnected the num2 input of ?
    connected ? -> ? (num1)
    set ?.logicOperator = Less Than
  Outside Program (48s, present unknown)
    sim: not running
2. 2024-02-05 18:33:14, history start 341, duration 38s
  Program Changes (6s)
    disconnected the num1 input of ?
    connected ? -> ? (num2)
    connected ? -> ? (num1)
    set ?.logicOperator = Greater Than
  Outside Program (32s, present unknown)
    sim: not running
```

### ep-028

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-012`
- **outputs:** Demo Output Light Bulb
- **ticks:** none during this episode (the document has some)
- **cycles:** 3
- **changes:** 16 node, 24 conn, 4 param
- **start:** 2024-02-05 18:33:22 · entry 602 of 963 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-012&studentDocumentHistoryId=entry-054)
- **end:** 2024-02-05 18:37:12 · entry 719 of 963 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-012&studentDocumentHistoryId=entry-055)

```
1. 2024-02-05 18:33:22, history start 602, duration 103s
  Program Changes (33s, 2 targets)
    connected ? -> ? (num1)
    connected ? -> ? (nodeValue)
    connected ? -> ? (nodeValue)
    disconnected the nodeValue input of ?
    connected ? -> ? (nodeValue)
    connected ? -> ? (num2)
    disconnected the num2 input of ?
    connected ? -> ? (num2)
  Outside Program (70s, present unknown)
    sim: not running
2. 2024-02-05 18:35:05, history start 611, duration 2m 7s
  Program Changes (49s, 6 targets)
    disconnected the num2 input of ?
    deleted the ? node
    disconnected the num1 input of ?
    deleted the ? node
    disconnected the nodeValue input of ?
    deleted the ? node
    deleted the ? node
    added a Demo Output node
    added a Sensor node
  Outside Program (77s, present unknown)
    sim: not running
3. 2024-02-05 18:37:12, history start 624, then no further edits
  Program Changes (2m 50s, 7 targets)
    connected Sensor -> Demo Output (nodeValue)
    added a Timer node
    connected Timer -> Demo Output (nodeValue)
    disconnected the nodeValue input of Demo Output
    connected Sensor -> Demo Output (nodeValue)
    disconnected the nodeValue input of Demo Output
    disconnected the nodeValue input of Demo Output
    deleted the Sensor node
    deleted the Timer node
    added a Sensor node
    set Sensor.type = light
    deleted the Sensor node
    added a Sensor node
    set Sensor.type = O2
    set Sensor.sensor = 00004-VIR
    set Sensor.virtual = true
    connected Sensor -> Demo Output (nodeValue)
    disconnected the nodeValue input of Demo Output
    connected Sensor -> Demo Output (nodeValue)
    added a Generator node
    deleted the Generator node
    added a Sensor node
    connected Sensor -> Demo Output (nodeValue)
    disconnected the nodeValue input of Demo Output
    disconnected the nodeValue input of Demo Output
    deleted the Sensor node
    connected Sensor -> Demo Output (nodeValue)
  Outside Program (no further edits, showing 120s)
    sim: not running
```

### ep-032

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-016`
- **outputs:** none
- **ticks:** none -- this document has no tick data at all
- **cycles:** 3
- **changes:** 12 node, 12 conn, 15 param
- **start:** 2024-02-05 18:32:37 · entry 348 of 922 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-016&studentDocumentHistoryId=entry-062)
- **end:** 2024-02-05 18:36:13 · entry 505 of 922 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-016&studentDocumentHistoryId=entry-063)

```
1. 2024-02-05 18:32:37, history start 348, duration 2m 15s
  Program Changes (88s, 3 targets)
    set ?.outputType = Advanced Grabber
    connected ? -> ? (?)
    set ?.outputType = Light Bulb
    disconnected the ? input of ?
    set ?.outputType = Grabber
    connected ? -> ? (?)
    disconnected the ? input of ?
    set ?.outputType = Light Bulb
    set ?.logicOperator = Equal
    set ?.period = 1
    set ?.plot = true
    disconnected the num2 input of ?
    connected ? -> ? (num1)
    connected Number -> ? (num2)
    disconnected the num2 input of ?
    set ?.generatorType = Triangle
    set ?.logicOperator = Greater Than
    set ?.logicOperator = Less Than
    connected ? -> ? (num2)
  Outside Program (47s, present unknown)
    sim: not running
2. 2024-02-05 18:34:52, history start 465, duration 81s
  Program Changes (44s, 4 targets)
    added a Sensor node
    added a Sensor node
    added a Sensor node
    connected Sensor -> ? (num2)
    disconnected the num2 input of ?
    set Sensor.type = humidity
    set Sensor.sensor = 00002-VIR
    set Sensor.virtual = true
    set ?.logicOperator = Equal
    set ?.logicOperator = Less Than
  Outside Program (37s, present unknown)
    sim: not running
3. 2024-02-05 18:36:13, history start 481, duration 58s
  Program Changes (21s, 9 targets)
    deleted the ? node
    deleted the Math node
    deleted the ? node
    deleted the Number node
    disconnected the num1 input of ?
    deleted the ? node
    deleted the Sensor node
    deleted the ? node
    added a Demo Output node
    added a Sensor node
  Outside Program (36s, present unknown)
    sim: not running
```

### ep-038

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-017`
- **outputs:** Demo Output Light Bulb
- **ticks:** none -- this document has no tick data at all
- **cycles:** 2
- **changes:** 4 node, 7 conn, 1 param
- **start:** 2024-02-05 18:43:53 · entry 665 of 855 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-017&studentDocumentHistoryId=entry-074)
- **end:** 2024-02-05 18:45:31 · entry 707 of 855 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-017&studentDocumentHistoryId=entry-075)

```
1. 2024-02-05 18:43:53, history start 665, duration 98s
  Program Changes (60s, 3 targets)
    deleted the Math node
    added a Logic node
    connected Sensor -> Logic (num2)
    disconnected the nodeValue input of Demo Output
    disconnected the num2 input of Logic
    connected Sensor -> Logic (num2)
    connected Sensor -> Logic (num1)
    connected Logic -> Demo Output (nodeValue)
  Outside Program (39s, present unknown)
    sim: not running
2. 2024-02-05 18:45:31, history start 699, then no further edits
  Program Changes (25s, 3 targets)
    set Logic.logicOperator = Less Than
    disconnected the nodeValue input of Demo Output
    deleted the Logic node
    added a Logic node
  Outside Program (no further edits, showing 120s)
    sim: not running
```

### ep-043

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-020`
- **outputs:** Demo Output Light Bulb
- **ticks:** none -- this document has no tick data at all
- **cycles:** 3
- **changes:** 2 node, 10 conn (Demo Output)
- **start:** 2024-02-05 18:30:46 · entry 253 of 517 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-020&studentDocumentHistoryId=entry-084)
- **end:** 2024-02-05 18:35:14 · entry 283 of 517 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-020&studentDocumentHistoryId=entry-085)

```
1. 2024-02-05 18:30:46, history start 253, duration 53s
  Program Changes (20s)
    connected ? -> ? (num1)
    disconnected the num1 input of ?
  Outside Program (33s, present unknown)
    sim: not running
2. 2024-02-05 18:31:39, history start 259, duration 3m 36s
  Program Changes (37s, 2 targets)
    connected ? -> ? (num1)
    disconnected the nodeValue input of ?
    connected ? -> ? (nodeValue)
    disconnected the nodeValue input of ?
    disconnected the num1 input of ?
    connected ? -> ? (num1)
    connected ? -> ? (nodeValue)
    connected ? -> ? (num2)
  Outside Program (2m 59s, present unknown)
    sim: not running
3. 2024-02-05 18:35:14, history start 278, then no further edits
  Program Changes (8s)
    added a Demo Output node
    deleted the Demo Output node
  Outside Program (no further edits, showing 120s)
    sim: not running
```

### ep-044

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-021`
- **outputs:** none
- **ticks:** none -- this document has no tick data at all
- **cycles:** 2
- **changes:** 5 node, 4 conn, 2 param
- **start:** 2024-02-05 18:21:58 · entry 2 of 494 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-021&studentDocumentHistoryId=entry-086)
- **end:** 2024-02-05 18:22:55 · entry 24 of 494 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-021&studentDocumentHistoryId=entry-087)

```
1. 2024-02-05 18:21:58, history start 2, duration 57s
  Program Changes (24s, 3 targets)
    added a Number node
    added a Number node
    added a Math node
    set Math.mathOperator = Subtract
    connected Number -> Math (num1)
    connected Number -> Math (num2)
  Outside Program (33s, present unknown)
    sim: not running
2. 2024-02-05 18:22:55, history start 14, duration 84s
  Program Changes (37s, 3 targets)
    set Math.mathOperator = Add
    added a Logic node
    connected Math -> Logic (num1)
    added a Demo Output node
    connected Logic -> Demo Output (nodeValue)
  Outside Program (47s, present unknown)
    sim: not running
```

### ep-049

- **date:** 2024-02-09
- **unit/problem:** brain 2
- **document:** `doc-023`
- **outputs:** none
- **ticks:** none -- this document has no tick data at all
- **cycles:** 2
- **changes:** 8 node, 11 conn, 3 param
- **start:** 2024-02-09 15:58:28 · entry 946 of 2169 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-023&studentDocumentHistoryId=entry-096)
- **end:** 2024-02-09 16:00:32 · entry 986 of 2169 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-023&studentDocumentHistoryId=entry-097)

```
1. 2024-02-09 15:58:28, history start 946, duration 2m 4s
  Program Changes (94s, 7 targets)
    added a Sensor node
    disconnected the nodeValue input of ?
    deleted the ? node
    deleted the Sensor node
    added a Generator node
    set Generator.generatorType = Square
    added a Logic node
    added a Math node
    deleted the Math node
    added a Number node
    connected Generator -> Logic (num1)
    connected Number -> Logic (num2)
    connected Logic -> ? (nodeValue)
    disconnected the nodeValue input of ?
    connected Logic -> ? (nodeValue)
    disconnected the num2 input of Logic
    connected Generator -> Logic (num2)
    set Logic.logicOperator = Less Than
  Outside Program (30s, present unknown)
    sim: not running
2. 2024-02-09 16:00:32, history start 983, then no further edits
  Program Changes (5s)
    set Logic.logicOperator = Greater Than
    disconnected the num1 input of Logic
    connected Number -> Logic (num2)
    connected Generator -> Logic (num1)
  Outside Program (no further edits, showing 120s)
    sim: not running
```

### ep-053

- **date:** 2024-02-09
- **unit/problem:** brain 2
- **document:** `doc-026`
- **outputs:** none
- **ticks:** none -- this document has no tick data at all
- **cycles:** 3
- **changes:** 6 node, 13 conn, 1 param
- **start:** 2024-02-09 15:58:04 · entry 594 of 1904 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-026&studentDocumentHistoryId=entry-104)
- **end:** 2024-02-09 16:01:50 · entry 644 of 1904 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-026&studentDocumentHistoryId=entry-105)

```
1. 2024-02-09 15:58:04, history start 594, duration 92s
  Program Changes (61s, 6 targets)
    added a Generator node
    disconnected the nodeValue input of ?
    deleted the ? node
    set Generator.generatorType = Square
    added a Logic node
    added a Number node
    added a Number node
    connected Number -> Logic (num1)
    connected Number -> Logic (num2)
  Outside Program (31s, present unknown)
    sim: not running
2. 2024-02-09 15:59:36, history start 632, duration 2m 15s
  Program Changes (5s, 3 targets)
    disconnected the num2 input of Logic
    deleted the Number node
    connected Generator -> Logic (num2)
    connected Logic -> ? (nodeValue)
  Outside Program (2m 9s, present unknown)
    sim: not running
3. 2024-02-09 16:01:50, history start 635, then no further edits
  Program Changes (17s)
    disconnected the num1 input of Logic
    disconnected the num2 input of Logic
    connected Number -> Logic (num1)
    disconnected the num1 input of Logic
    disconnected the num1 input of Logic
    connected Number -> Logic (num2)
    connected Generator -> Logic (num1)
  Outside Program (no further edits, showing 120s)
    sim: not running
```

### ep-056

- **date:** 2024-02-09
- **unit/problem:** brain 2
- **document:** `doc-029`
- **outputs:** Demo Output Light Bulb
- **ticks:** none -- this document has no tick data at all
- **cycles:** 2
- **changes:** 4 node, 1 conn, 2 param
- **start:** 2024-02-09 15:58:14 · entry 1261 of 2442 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-029&studentDocumentHistoryId=entry-110)
- **end:** 2024-02-09 15:59:14 · entry 1279 of 2442 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-029&studentDocumentHistoryId=entry-111)

```
1. 2024-02-09 15:58:14, history start 1261, duration 61s
  Program Changes (13s, 3 targets)
    added a Generator node
    set Generator.generatorType = Square
    added a Demo Output node
    added a Logic node
  Outside Program (47s, present unknown)
    sim: not running
2. 2024-02-09 15:59:14, history start 1273, duration 44s
  Program Changes (18s, 3 targets)
    added a Number node
    set Generator.amplitude = 0.5
    connected Generator -> Logic (num1)
  Outside Program (27s, present unknown)
    sim: not running
```

## trial_and_error — control (15 shown)

### ep-005

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-002`
- **outputs:** none
- **ticks:** none -- this document has no tick data at all
- **cycles:** 1
- **changes:** 1 conn, 1 param
- **start:** 2024-02-05 18:30:46 · entry 220 of 742 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-002&studentDocumentHistoryId=entry-008)
- **end:** 2024-02-05 18:30:46 · entry 221 of 742 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-002&studentDocumentHistoryId=entry-009)

```
1. 2024-02-05 18:30:46, history start 220, then no further edits
  Program Changes (0s)
    disconnected the num1 input of ?
    set ?.logicOperator = Greater Than
  Outside Program (no further edits, showing 120s)
    sim: not running
```

### ep-010

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-004`
- **outputs:** none
- **ticks:** none -- this document has no tick data at all
- **cycles:** 1
- **changes:** 16 conn
- **start:** 2024-02-05 18:32:01 · entry 279 of 692 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-004&studentDocumentHistoryId=entry-018)
- **end:** 2024-02-05 18:32:01 · entry 292 of 692 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-004&studentDocumentHistoryId=entry-019)

```
1. 2024-02-05 18:32:01, history start 279, then no further edits
  Program Changes (62s)
    disconnected the num1 input of ?
    connected ? -> ? (num2)
    connected ? -> ? (num2)
    disconnected the num2 input of ?
    connected ? -> ? (num1)
    connected ? -> ? (num2)
    disconnected the num2 input of ?
    disconnected the num2 input of ?
    connected ? -> ? (num1)
    connected ? -> ? (num2)
    disconnected the num1 input of ?
    connected ? -> ? (num2)
    connected ? -> ? (num1)
    disconnected the num1 input of ?
    connected ? -> ? (num2)
    connected ? -> ? (num1)
  Outside Program (no further edits, showing 120s)
    sim: not running
```

### ep-012

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-005`
- **outputs:** Demo Output Light Bulb
- **ticks:** none -- this document has no tick data at all
- **cycles:** 1
- **changes:** 5 node, 4 conn, 1 param
- **start:** 2024-02-05 18:43:41 · entry 178 of 403 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-005&studentDocumentHistoryId=entry-022)
- **end:** 2024-02-05 18:43:41 · entry 195 of 403 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-005&studentDocumentHistoryId=entry-023)

```
1. 2024-02-05 18:43:41, history start 178, then no further edits
  Program Changes (45s, 4 targets)
    added a Math node
    added a Sensor node
    deleted the Math node
    added a Number node
    set Sensor.plot = true
    deleted the Sensor node
    connected Number -> Demo Output (nodeValue)
    disconnected the nodeValue input of Demo Output
    connected Sensor -> Demo Output (nodeValue)
    disconnected the nodeValue input of Demo Output
  Outside Program (no further edits, showing 120s)
    sim: not running
```

### ep-013

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-005`
- **outputs:** none
- **ticks:** none -- this document has no tick data at all
- **cycles:** 1
- **changes:** 3 node, 2 conn, 1 param (Math, Number)
- **start:** 2024-02-05 18:27:20 · entry 106 of 403 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-005&studentDocumentHistoryId=entry-024)
- **end:** 2024-02-05 18:27:20 · entry 125 of 403 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-005&studentDocumentHistoryId=entry-025)

```
1. 2024-02-05 18:27:20, history start 106, then no further edits
  Program Changes (46s, 3 targets)
    added a Math node
    added a Number node
    added a Number node
    set Math.plot = true
    connected Number -> Math (num1)
    connected Number -> Math (num2)
  Outside Program (no further edits, showing 120s)
    sim: not running
```

### ep-014

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-006`
- **outputs:** none
- **ticks:** none during this episode (the document has some)
- **cycles:** 1
- **changes:** 7 node, 2 conn (Math, Number)
- **start:** 2024-02-05 18:27:48 · entry 620 of 653 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-006&studentDocumentHistoryId=entry-026)
- **end:** 2024-02-05 18:27:48 · entry 637 of 653 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-006&studentDocumentHistoryId=entry-027)

```
1. 2024-02-05 18:27:48, history start 620, then no further edits
  Program Changes (45s, 7 targets)
    added a Math node
    deleted the ? node
    deleted the ? node
    deleted the ? node
    deleted the ? node
    added a Number node
    added a Number node
    connected Number -> Math (num1)
    connected Number -> Math (num2)
  Outside Program (no further edits, showing 120s)
    sim: not running
```

### ep-020

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-009`
- **outputs:** none
- **ticks:** none -- this document has no tick data at all
- **cycles:** 1
- **changes:** 4 node, 4 conn, 2 param (Math, Number)
- **start:** 2024-02-05 18:25:59 · entry 263 of 680 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-009&studentDocumentHistoryId=entry-038)
- **end:** 2024-02-05 18:25:59 · entry 283 of 680 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-009&studentDocumentHistoryId=entry-039)

```
1. 2024-02-05 18:25:59, history start 263, duration 114s
  Program Changes (73s, 4 targets)
    connected Math -> Math (num2)
    disconnected the num2 input of Math
    set Math.plot = true
    set Math.plot = false
    added a Number node
    connected Number -> Math (num2)
    added a Number node
    connected Number -> Math (num1)
    added a Number node
    deleted the Number node
  Outside Program (41s, present unknown)
    sim: not running
```

### ep-021

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-009`
- **outputs:** none
- **ticks:** none -- this document has no tick data at all
- **cycles:** 1
- **changes:** 3 node, 2 conn (Number, Math)
- **start:** 2024-02-05 18:37:03 · entry 322 of 680 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-009&studentDocumentHistoryId=entry-040)
- **end:** 2024-02-05 18:37:03 · entry 333 of 680 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-009&studentDocumentHistoryId=entry-041)

```
1. 2024-02-05 18:37:03, history start 322, then no further edits
  Program Changes (24s, 3 targets)
    added a Number node
    added a Number node
    added a Math node
    connected Number -> Math (num1)
    connected Number -> Math (num2)
  Outside Program (no further edits, showing 120s)
    sim: not running
```

### ep-023

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-011`
- **outputs:** none
- **ticks:** none -- this document has no tick data at all
- **cycles:** 1
- **changes:** 4 node, 1 conn
- **start:** 2024-02-05 18:35:07 · entry 296 of 844 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-011&studentDocumentHistoryId=entry-044)
- **end:** 2024-02-05 18:35:07 · entry 301 of 844 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-011&studentDocumentHistoryId=entry-045)

```
1. 2024-02-05 18:35:07, history start 296, duration 49s
  Program Changes (18s, 4 targets)
    disconnected the num1 input of Math
    deleted the Number node
    deleted the Number node
    deleted the Math node
    added a Demo Output node
  Outside Program (31s, present unknown)
    sim: not running
```

### ep-024

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-011`
- **outputs:** Demo Output Light Bulb
- **ticks:** none -- this document has no tick data at all
- **cycles:** 1
- **changes:** 4 conn (Demo Output, Logic)
- **start:** 2024-02-05 18:38:34 · entry 336 of 844 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-011&studentDocumentHistoryId=entry-046)
- **end:** 2024-02-05 18:38:34 · entry 342 of 844 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-011&studentDocumentHistoryId=entry-047)

```
1. 2024-02-05 18:38:34, history start 336, duration 46s
  Program Changes (13s, 2 targets)
    connected Logic -> Demo Output (nodeValue)
    disconnected the nodeValue input of Demo Output
    connected Sensor -> Logic (num2)
    connected Logic -> Demo Output (nodeValue)
  Outside Program (32s, present unknown)
    sim: not running
```

### ep-026

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-012`
- **outputs:** none
- **ticks:** none during this episode (the document has some)
- **cycles:** 1
- **changes:** 30 node, 5 conn, 2 param
- **start:** 2024-02-05 18:30:10 · entry 516 of 963 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-012&studentDocumentHistoryId=entry-050)
- **end:** 2024-02-05 18:30:10 · entry 583 of 963 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-012&studentDocumentHistoryId=entry-051)

```
1. 2024-02-05 18:30:10, history start 516, then no further edits
  Program Changes (98s, 10 targets)
    disconnected the num1 input of Math
    deleted the Number node
    deleted the Number node
    deleted the Math node
    added a Generator node
    added a Logic node
    set Logic.plot = true
    added a Generator node
    deleted the Generator node
    added a Generator node
    deleted the Generator node
    deleted the Logic node
    deleted the Generator node
    added a Number node
    deleted the Number node
    added a Generator node
    added a Logic node
    added a Generator node
    deleted the Generator node
    set Logic.plot = false
    deleted the Logic node
    deleted the Generator node
    added a Math node
    added a Number node
    connected Number -> Math (num2)
    added a Number node
    disconnected the num2 input of Math
    added a Number node
    deleted the Math node
    deleted the Number node
    deleted the Number node
    added a Math node
    connected Number -> Math (num1)
    added a Generator node
    deleted the Generator node
    added a Number node
    connected Number -> Math (num2)
  Outside Program (no further edits, showing 120s)
    sim: not running
```

### ep-027

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-012`
- **outputs:** none
- **ticks:** none during this episode (the document has some)
- **cycles:** 1
- **changes:** 9 conn
- **start:** 2024-02-05 18:32:05 · entry 587 of 963 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-012&studentDocumentHistoryId=entry-052)
- **end:** 2024-02-05 18:32:05 · entry 598 of 963 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-012&studentDocumentHistoryId=entry-053)

```
1. 2024-02-05 18:32:05, history start 587, then no further edits
  Program Changes (49s, 2 targets)
    connected ? -> ? (num2)
    connected ? -> ? (nodeValue)
    connected ? -> ? (num2)
    disconnected the num2 input of ?
    connected ? -> ? (num1)
    disconnected the num1 input of ?
    connected ? -> ? (num2)
    disconnected the nodeValue input of ?
    disconnected the num2 input of ?
  Outside Program (no further edits, showing 120s)
    sim: not running
```

### ep-033

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-016`
- **outputs:** Demo Output Light Bulb
- **ticks:** none -- this document has no tick data at all
- **cycles:** 1
- **changes:** 6 node (Math, Number)
- **start:** 2024-02-05 18:50:44 · entry 900 of 922 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-016&studentDocumentHistoryId=entry-064)
- **end:** 2024-02-05 18:50:44 · entry 916 of 922 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-016&studentDocumentHistoryId=entry-065)

```
1. 2024-02-05 18:50:44, history start 900, then no further edits
  Program Changes (23s, 5 targets)
    added a Math node
    added a Math node
    deleted the Math node
    added a Number node
    added a Number node
    added a Number node
  Outside Program (no further edits, showing 120s)
    sim: not running
```

### ep-034

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-016`
- **outputs:** none
- **ticks:** none -- this document has no tick data at all
- **cycles:** 1
- **changes:** 1 node, 2 conn (Math)
- **start:** 2024-02-05 18:27:36 · entry 317 of 922 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-016&studentDocumentHistoryId=entry-066)
- **end:** 2024-02-05 18:27:36 · entry 321 of 922 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-016&studentDocumentHistoryId=entry-067)

```
1. 2024-02-05 18:27:36, history start 317, then no further edits
  Program Changes (4s, 2 targets)
    added a Math node
    disconnected the num1 input of ?
    connected ? -> ? (num1)
  Outside Program (no further edits, showing 120s)
    sim: not running
```

### ep-035

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-017`
- **outputs:** none
- **ticks:** none -- this document has no tick data at all
- **cycles:** 1
- **changes:** 3 node (Generator, Math)
- **start:** 2024-02-05 18:26:56 · entry 183 of 855 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-017&studentDocumentHistoryId=entry-068)
- **end:** 2024-02-05 18:26:56 · entry 187 of 855 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-017&studentDocumentHistoryId=entry-069)

```
1. 2024-02-05 18:26:56, history start 183, duration 64s
  Program Changes (33s, 2 targets)
    added a Generator node
    deleted the Generator node
    added a Math node
  Outside Program (31s, present unknown)
    sim: not running
```

### ep-036

- **date:** 2024-02-05
- **unit/problem:** brain 1
- **document:** `doc-017`
- **outputs:** none
- **ticks:** none -- this document has no tick data at all
- **cycles:** 1
- **changes:** 8 node
- **start:** 2024-02-05 18:29:01 · entry 208 of 855 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-017&studentDocumentHistoryId=entry-070)
- **end:** 2024-02-05 18:29:01 · entry 252 of 855 · [open](https://redacted.demo.link.invalid/branch/master/?class=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fclasses%2FCLASS&offering=https%3A%2F%2Flearn.concord.org%2Fapi%2Fv1%2Fofferings%2FOFFERING&reportType=offering&authDomain=https%3A%2F%2Flearn.concord.org&researcher=true&studentDocument=doc-017&studentDocumentHistoryId=entry-071)

```
1. 2024-02-05 18:29:01, history start 208, duration 69s
  Program Changes (36s, 4 targets)
    added a Timer node
    added a Control node
    deleted the Control node
    added a Control node
    deleted the Timer node
    deleted the Control node
    added a Demo Output node
    added a Demo Output node
  Outside Program (33s, present unknown)
    sim: not running
```
