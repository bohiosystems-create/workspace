const {listUpdates}=require('./_store');

module.exports=async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  try{
    const updates=await listUpdates();
    res.setHeader('Cache-Control','no-store, max-age=0');
    return res.status(200).json({updates});
  }catch(error){
    return res.status(503).json({updates:[],configured:false,error:error.message});
  }
};
