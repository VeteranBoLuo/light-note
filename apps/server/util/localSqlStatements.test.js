import { expect, it } from 'vitest';
import { localSqlStatements } from './localSqlStatements.js';

it('handles session variables, one-line statements, quoted delimiters and comments', () => {
  expect(localSqlStatements("-- comment;\nSET @a='a;b'; PREPARE s FROM @a; -- trailing comment\nSELECT 'it''s;ok', `a;b`;\n")).toEqual([
    "SET @a='a;b'", 'PREPARE s FROM @a', "SELECT 'it''s;ok', `a;b`",
  ]);
});
it('keeps stored procedures intact and restores the normal delimiter', () => {
  expect(localSqlStatements('DELIMITER $$\nCREATE PROCEDURE p()\nBEGIN\n SELECT 1;\nEND$$\nDELIMITER ;\nCALL p();\n')).toEqual([
    'CREATE PROCEDURE p()\nBEGIN\n SELECT 1;\nEND', 'CALL p()',
  ]);
});
it('fails closed on incomplete SQL', () => {
  expect(() => localSqlStatements("SELECT 'unclosed;")).toThrow('LOCAL_SQL_INCOMPLETE');
  expect(() => localSqlStatements('SELECT 1 /*')).toThrow('LOCAL_SQL_UNCLOSED_COMMENT');
});
