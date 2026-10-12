---
lat:
  require-code-mention: true
---
# Office rendering tests

Actual Office components must stop hidden frame scheduling, retain scene lifetime and resume visible animation without duplicate loops. The WebGL and external asset/API boundaries are synthetic.

## Hidden pane stops frames

After navigation away, frame counts remain unchanged. Repeated returns resume the same Canvas instance with at most one scheduled loop.

## Background document stops frames

Document backgrounding pauses a selected Office. Becoming visible cannot restart an unselected pane; selecting Office again resumes its loop.

## Hidden initial mount

An Office first mounted while the document is hidden schedules no frames until the document becomes visible.

## Unmount cleans visibility owner

Unmount removes the screen's exact visibility listener and cancels the frame scheduler, so later visibility events cannot revive it.
