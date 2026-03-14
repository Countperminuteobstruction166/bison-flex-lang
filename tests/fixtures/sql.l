%{
#include "sql.tab.h"
#include <stdlib.h>
#include <string.h>
%}

%option noyywrap
%option noinput
%option nounput
%option case-insensitive

digit       [0-9]
letter      [a-zA-Z_]
identifier  {letter}({letter}|{digit})*
integer     {digit}+
decimal     {digit}+\.{digit}*
spaces      [ \t\r\n]+

%x SC_STRING

%%

"SELECT"    { return SELECT; }
"FROM"      { return FROM; }
"WHERE"     { return WHERE; }
"INSERT"    { return INSERT; }
"INTO"      { return INTO; }
"VALUES"    { return VALUES; }
"CREATE"    { return CREATE; }
"TABLE"     { return TABLE; }
"DROP"      { return DROP; }
"AND"       { return AND; }
"OR"        { return OR; }
"NOT"       { return NOT; }
"NULL"      { return NULL_TOK; }
"INT"       { return INT_TYPE; }
"VARCHAR"   { return VARCHAR; }
"TEXT"      { return TEXT; }

{decimal}   { yylval.NUMBER = atof(yytext); return NUMBER; }
{integer}   { yylval.NUMBER = atof(yytext); return NUMBER; }
{identifier} { yylval.IDENTIFIER = strdup(yytext); return IDENTIFIER; }

\'                      { BEGIN(SC_STRING); }
<SC_STRING>[^'\\]*      { yylval.STRING_LIT = strdup(yytext); }
<SC_STRING>\\\'         { /* escaped quote */ }
<SC_STRING>\'           { BEGIN(INITIAL); return STRING_LIT; }

"*"         { return STAR; }
","         { return COMMA; }
"("         { return LPAREN; }
")"         { return RPAREN; }
";"         { return SEMI; }
"="         { return EQ; }
"!="        { return NE; }
"<>"        { return NE; }
"<="        { return LE; }
">="        { return GE; }
"<"         { return LT; }
">"         { return GT; }
"."         { return DOT; }

{spaces}    { /* skip whitespace */ }
.           { fprintf(stderr, "Unexpected character: %s\n", yytext); }

%%
