'use strict';
// Temporary read-only connection check. Remove after diagnosis.
// Never returns tokens, file contents, account data, or caller-defined paths.
const dbx=require('../server/field-dropbox');
module.exports=async function(req,res){
 res.setHeader('Cache-Control','no-store, max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return res.status(405).json({result:'method_not_allowed'});
 const config=dbx.projectConfig('atalia');
 try{
  const root=await dbx.metadata('atalia',config.root);
  if(root['.tag']!=='folder')return res.status(503).json({result:'invalid_root_type'});
 }catch(e){
  const status=e.status||500,detail=String(e.detail||'');
  console.error('atalia connection check: root inaccessible; upstream status '+status+
    (status===409?'; lookup='+(detail.includes('not_found')?'not_found':'other_conflict'):''));
  return res.status(503).json({
   result:'root_unavailable',
   category:status===409?(detail.includes('not_found')?'path_not_found':'path_conflict'):
    status===503?'token_or_dropbox_unavailable':'request_failed'
  });
 }
 try{
  const folder=await dbx.metadata('atalia',config.root+'/CONTROL_ACCESO_MOVIL');
  if(folder['.tag']!=='folder')return res.status(503).json({result:'profile_folder_wrong_type'});
  return res.status(200).json({result:'ok',root:'accessible',profileFolder:'accessible'});
 }catch(e){
  const status=e.status||500,detail=String(e.detail||'');
  console.error('atalia connection check: profile folder unavailable; upstream status '+status);
  return res.status(503).json({
   result:'profile_folder_unavailable',root:'accessible',
   category:status===409?(detail.includes('not_found')?'not_found':'conflict'):
     status===503?'dropbox_unavailable':'request_failed'
  });
 }
};