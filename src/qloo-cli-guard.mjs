// Preloaded in our child process; the pinned CLI otherwise follows redirects and
// buffers response.json() without a size cap. Do not modify the vendor package.
const originalFetch=globalThis.fetch;
const maxBytes=1000000;
globalThis.fetch=async(input,options)=>{
  const response=await originalFetch(input,{...options,redirect:'error'});
  if(Number(response.headers.get('content-length'))>maxBytes){await response.body?.cancel();throw Error('Qloo response limit exceeded.');}
  if(!response.body)return response;
  let size=0;
  const body=response.body.pipeThrough(new TransformStream({transform(chunk,controller){size+=chunk.byteLength;if(size>maxBytes){controller.error(Error('Qloo response limit exceeded.'));return;}controller.enqueue(chunk);}}));
  return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
};
