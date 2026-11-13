import { createFileRoute } from '@tanstack/react-router';
export const Route=createFileRoute('/api/public/health-history')({server:{handlers:{
  GET:async({request})=>{const {readHistoryResponse}=await import('@/lib/health-history.server');return readHistoryResponse(request);},
  OPTIONS:async()=>new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS'}}),
}}});