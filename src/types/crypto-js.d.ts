declare module 'crypto-js/md5' {
  interface WordArray {
    toString(encoder?: unknown): string;
  }

  export default function md5(message: string): WordArray;
}
