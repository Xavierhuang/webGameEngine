export interface ObjectBubble {
  text: string;
  style: 'say' | 'think';
  expiresAt: number | null;
}

/** A hidden object cannot leave a detached speech bubble in the scene. */
export function bubbleForVisibility(
  bubble: ObjectBubble | null,
  visible: boolean,
): ObjectBubble | null {
  return visible ? bubble : null;
}
