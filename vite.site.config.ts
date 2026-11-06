import {defineConfig} from 'vite';
// The hosted, static live page (GitHub Pages). It reads NEAR testnet RPC from the browser; no server.
export default defineConfig({root:'site',base:'./',publicDir:'public',build:{outDir:'../dist/site',emptyOutDir:true,assetsInlineLimit:0},server:{host:'127.0.0.1',port:Number(process.env.ARCHIVEPASS_SITE_PORT??5175),strictPort:true,fs:{allow:['..']}}});
