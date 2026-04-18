export function makeTextStub(initial = ''): {
  text: string;
  textFill: { mode: unknown; color: unknown };
} {
  return {
    text: initial,
    textFill: {
      mode: null,
      color: null,
    },
  };
}

export function makeSceneObjectStub(): { enabled: boolean; setParent: jest.Mock } {
  return {
    enabled: false,
    setParent: jest.fn(),
  };
}

export function makePinchInteractorStub(): {
  onPinchStart: { add: jest.Mock };
  onFocusEnd: { add: jest.Mock };
} {
  return {
    onPinchStart: { add: jest.fn() },
    onFocusEnd: { add: jest.fn() },
  };
}
