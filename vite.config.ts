import {defineConfig} from 'vite';
export default defineConfig({root:'web',build:{outDir:'../dist/web',emptyOutDir:true},server:{host:'127.0.0.1',port:Number(process.env.ARCHIVEPASS_WEB_PORT??5174),strictPort:true,proxy:{'/api':`http://127.0.0.1:${process.env.ARCHIVEPASS_API_PORT??8788}`}}});
