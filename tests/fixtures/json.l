%{
#include "json.tab.h"
#include <stdlib.h>
#include <string.h>
%}

%option noyywrap
%option noinput
%option nounput

%x SC_STRING

digit     [0-9]
integer   -?{digit}+
fraction  \.{digit}+
exponent  [eE][+-]?{digit}+
spaces    [ \t\r\n]+

%%

\"                      { BEGIN(SC_STRING); }
<SC_STRING>[^"\\]*      { yylval.STRING = strdup(yytext); }
<SC_STRING>\\["\\/bfnrt] { /* escape sequence */ }
<SC_STRING>\\u[0-9a-fA-F]{4} { /* unicode escape */ }
<SC_STRING>\"           { BEGIN(INITIAL); return STRING; }

{integer}{fraction}?{exponent}?   { yylval.NUMBER = atof(yytext); return NUMBER; }

"true"                  { return TRUE; }
"false"                 { return FALSE; }
"null"                  { return NULL_TOK; }

"{"                     { return LBRACE; }
"}"                     { return RBRACE; }
"["                     { return LBRACK; }
"]"                     { return RBRACK; }
":"                     { return COLON; }
","                     { return COMMA; }

{spaces}                { /* skip whitespace */ }
.                       { fprintf(stderr, "Unexpected character: %s\n", yytext); }

%%
