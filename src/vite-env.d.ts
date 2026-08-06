/// <reference types="vite/client" />



declare module 'html2pdf.js';

declare module 'html2canvas';

declare module 'jspdf';



interface ImportMetaEnv {

  readonly VITE_CLAUDE_API_KEY?: string;

  readonly VITE_CLAUDE_MODEL?: string;

}



interface ImportMeta {

  readonly env: ImportMetaEnv;

}

