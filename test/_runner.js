/***/
// foonyah の単体テストを実施する
// [LASTDATE-OF-EXECUTE] 20/03/16 node-v12.13.0, perfect!
var tests = ['basic'];
require('foonyah-ci').run(tests, __dirname, 5000 + 100 * 800);
