export const U64_MAX=(1n<<64n)-1n;
export const U128_MAX=(1n<<128n)-1n;
export const YOCTO=10n**24n;
function parse(value:string,max:bigint):bigint {if(typeof value!=='string'||!/^(0|[1-9][0-9]*)$/.test(value))throw new Error('Expected canonical nonnegative decimal integer');const n=BigInt(value);if(n>max)throw new Error('Integer overflow');return n;}
export function parseU64(value:string):bigint{return parse(value,U64_MAX);}
export function parseU128(value:string):bigint{return parse(value,U128_MAX);}
export function parseNear(value:string):string {if(typeof value!=='string'||!/^(0|[1-9][0-9]*)(\.[0-9]{1,24})?$/.test(value))throw new Error('Enter a nonnegative NEAR amount with at most 24 decimals');const [whole,fraction='']=value.split('.');const n=BigInt(whole)*YOCTO+BigInt(fraction.padEnd(24,'0'));if(n>U128_MAX)throw new Error('Amount overflow');return n.toString();}
export function formatNear(value:string):string {const n=parseU128(value);const fraction=(n%YOCTO).toString().padStart(24,'0').replace(/0+$/,'');return `${n/YOCTO}${fraction?'.'+fraction:''}`;}
