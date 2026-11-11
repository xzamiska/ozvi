/**
 * The public demo (ozvi.io/demo) runs the real widget against a fake project: this script, inlined
 * before widget.js, answers the widget's API calls in the browser. Nothing reaches a server: a
 * submitted report or idea is handed to the page (event "ozvi-demo") so it can show what the team
 * would get. The demo host app's "save" also fails here on purpose (HTTP 500), for the network log.
 */
export const DEMO_PROJECT = "ukazka";

export interface DemoData {
  config: { name: string; css: string; fonts: null; ideasPublic: true };
  ideas: { id: string; number: number; title: string; votes: number; status: string; label: string; weight: number; pending: boolean }[];
  roadmap: { url: string; lanes: { status: string; label: string; total: number; rows: { number: number; title: string; votes: number; sub: null; tags: never[]; url: string }[] }[] };
  changelog: { url: string; entries: { id: string; title: string; html: string; publishedAt: string; url: string; ai: false; aiNote: null; items: never[] }[] };
}

export function demoMockScript(data: DemoData): string {
  // JSON in a <script>: never let user-controlled-looking text close the tag.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return `(function(){
var D=${json},P="/${DEMO_PROJECT}/api/widget/",real=window.fetch.bind(window),n=131;
function res(o,s){return Promise.resolve(new Response(JSON.stringify(o),{status:s||200,headers:{"content-type":"application/json"}}))}
function tell(d){setTimeout(function(){window.dispatchEvent(new CustomEvent("ozvi-demo",{detail:d}))},0)}
// "Pozrieť hlásenie" / "Moje hlásenia" open the board in a new tab: here they open the demo board in the page.
var ro=window.open.bind(window);
function board(u){var x=new URL(u,location.href);window.dispatchEvent(new CustomEvent("ozvi-demo-open",{detail:{path:x.searchParams.get("return")||x.pathname}}))}
window.open=function(u,t,f){
  if(u==="about:blank"){var w={closed:false,close:function(){},focus:function(){}},loc={};
    Object.defineProperty(loc,"href",{set:function(v){if(String(v).indexOf("/${DEMO_PROJECT}/")>=0)board(v);else ro(v,t,f)}});w.location=loc;return w}
  if(String(u).indexOf("/${DEMO_PROJECT}/")>=0){board(u);return null}
  return ro(u,t,f)};
window.fetch=function(input,init){
  var url=typeof input==="string"?input:(input&&input.url)||String(input);
  if(url.indexOf("/demo/token")>=0)return res({token:"demo"});
  if(url.indexOf("/api/demo/")>=0)return res({error:"Databáza je nedostupná"},500);
  var i=url.indexOf(P);if(i<0)return real(input,init);
  var path=url.slice(i+P.length).split("?")[0],q=new URL(url,location.href).searchParams.get("q")||"";
  if(path==="config")return res(D.config);
  if(path==="ideas"){var l=q.length>=3?D.ideas.filter(function(x){return x.title.toLowerCase().indexOf(q.toLowerCase())>=0}):D.ideas;return res({ideas:l,voteMode:"simple",budget:null,signedIn:true})}
  if(path==="vote"){var b=JSON.parse(init&&init.body||"{}"),x=D.ideas.find(function(y){return y.id===b.id});if(x){x.votes+=b.weight?1:-1;x.weight=b.weight}return res({weight:b.weight,votes:x?x.votes:0,left:null})}
  if(path==="roadmap")return res(D.roadmap);
  if(path==="changelog")return res(D.changelog);
  if(path==="items"&&init&&init.body instanceof FormData){
    var f=init.body,files=[];f.getAll("files").forEach(function(v){if(v instanceof Blob)files.push({name:v.name||"",url:URL.createObjectURL(v)})});
    var ctx={};try{ctx=JSON.parse(f.get("context")||"{}")}catch(e){}
    n++;tell({kind:f.get("kind")||"bug",number:n,title:f.get("title")||"",body:f.get("body")||"",context:ctx,files:files});
    return res({number:n,url:"/${DEMO_PROJECT}/i/"+n,pending:null});
  }
  return res({error:"not in the demo"},404);
};})();`;
}
