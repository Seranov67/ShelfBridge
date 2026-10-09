import {createVercelHandler} from '../src/vercel-app.mjs';

export function createFunctionHandler(factory=createVercelHandler){
let handler;
return async function handle(req,res){
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/api/handler'){
      const endpoint=url.searchParams.get('sb_endpoint');
      if(!['bootstrap','health','search','decision','decide','refine','gift-card'].includes(endpoint)){res.writeHead(404,{'Cache-Control':'no-store'});res.end();return;}
      url.searchParams.delete('sb_endpoint');req.url='/api/'+endpoint+url.search;
    }
    handler??=factory();await handler(req,res);
  }
  catch(error){
    if(res.destroyed||res.writableEnded)return;
    res.writeHead(error.status||503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(JSON.stringify({error:error.status?error.message:'Deployment configuration is unavailable. Contact the operator.',code:error.status?error.code:'deployment_configuration'}));
  }
};
}
export default createFunctionHandler();
