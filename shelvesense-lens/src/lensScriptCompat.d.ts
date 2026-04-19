declare abstract class BaseScriptComponent {
  createEvent(eventType: string): {
    bind(callback: (...args: any[]) => void): void;
    reset?(timeSeconds?: number): void;
  };
}

declare function component(...args: any[]): any;

declare function input(...args: any[]): any;
