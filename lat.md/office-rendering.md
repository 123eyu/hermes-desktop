# Office rendering lifetime

Office retains scene state across navigation while pausing its Canvas when the pane or application document is hidden, avoiding continued hidden rendering after a visit.

## Render lifetime

Rendering requires both the selected Office pane and a visible document. Document visibility changes have one listener owned by the mounted screen.

[[src/renderer/src/screens/Office/Office.tsx#Office]] initializes the document state before the first render, updates it on `visibilitychange`, and removes that listener on unmount. A document becoming visible cannot restart an unselected Office pane.

## Retained scene state

[[src/renderer/src/screens/Office/office3d/Office3D.tsx#Office3D]] uses a continuous frame loop while active and `never` while hidden, retaining its scene and camera instead of recreating them.

Changing Canvas `frameloop` lets React Three Fiber resume its normal visible render loop. Existing scene `useFrame` callbacks pause with rendering; they cannot keep simulating the hidden scene. Visibility changes do not remount the Canvas or duplicate its loop.

This fixes the demonstrated hidden-Office lifecycle behind issues #764/#784. It does not establish the root cause or exact GPU percentage of #852's reported fresh-install/no-Office state, or #845's machine-specific temperature report.

## Verification boundary

[[office-rendering-tests]] runs the actual Office and Office3D components with an instrumented Canvas frame scheduler and isolated asset/API boundaries.

The tests prove pause/resume configuration, retained Canvas lifetime and listener cleanup. They do not measure native Windows/Linux hardware utilization; packaged GPU measurements remain a separate environment-specific check.
