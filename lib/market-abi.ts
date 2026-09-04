export const marketAbi = [
  { type: "function", name: "buy", stateMutability: "nonpayable", inputs: [{name:"side",type:"uint8"},{name:"collateralIn",type:"uint256"},{name:"minSharesOut",type:"uint256"},{name:"deadline",type:"uint256"}], outputs: [{name:"sharesOut",type:"uint256"}] },
  { type: "function", name: "sell", stateMutability: "nonpayable", inputs: [{name:"side",type:"uint8"},{name:"sharesIn",type:"uint256"},{name:"minCollateralOut",type:"uint256"},{name:"deadline",type:"uint256"}], outputs: [{name:"collateralOut",type:"uint256"}] }
] as const;
