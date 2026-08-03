async function r(r,t){const a=await r;if(!a.success)throw new Error(a.error||t);return a.data}export{r as u};
