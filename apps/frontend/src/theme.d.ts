import '@emotion/react';

declare module '@emotion/react' {
  export interface Theme {
    // App styling uses CSS variables; no runtime Emotion theme.
  }
}
