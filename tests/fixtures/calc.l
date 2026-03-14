%{
#include "calc.tab.h"
#include <stdlib.h>
%}

%option noyywrap
%option noinput
%option nounput

digit     [0-9]
number    {digit}+(\.{digit}+)?
letter    [a-z]
spaces    [ \t]+

%%

{number}    { yylval.NUMBER = atof(yytext); return NUMBER; }
{letter}    { yylval.LETTER = yytext[0] - 'a'; return LETTER; }
"+"         { return PLUS; }
"-"         { return MINUS; }
"*"         { return TIMES; }
"/"         { return DIVIDE; }
"("         { return LPAREN; }
")"         { return RPAREN; }
"="         { return ASSIGN; }
\n          { return NEWLINE; }
{spaces}    { /* skip whitespace */ }
.           { fprintf(stderr, "Unexpected character: %s\n", yytext); }

%%
