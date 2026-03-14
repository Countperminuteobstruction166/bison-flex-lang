%{
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

extern int yylex(void);
void yyerror(const char *s);
%}

%define api.value.type union

%token <char *> STRING
%token <double> NUMBER
%token TRUE     "true"
%token FALSE    "false"
%token NULL_TOK "null"
%token LBRACE   "{"
%token RBRACE   "}"
%token LBRACK   "["
%token RBRACK   "]"
%token COLON    ":"
%token COMMA    ","

%type <void *> value object array members elements pair

%start json

%%

json : value  { /* root value parsed */ }
     ;

value : object               { $$ = $1; }
      | array                { $$ = $1; }
      | STRING               { $$ = $1; }
      | NUMBER               { $$ = NULL; }
      | TRUE                 { $$ = NULL; }
      | FALSE                { $$ = NULL; }
      | NULL_TOK             { $$ = NULL; }
      ;

object : LBRACE RBRACE              { $$ = NULL; }
       | LBRACE members RBRACE      { $$ = $2; }
       ;

members : pair                 { $$ = $1; }
        | members COMMA pair   { $$ = $3; }
        ;

pair : STRING COLON value   { $$ = $3; }
     ;

array : LBRACK RBRACK              { $$ = NULL; }
      | LBRACK elements RBRACK     { $$ = $2; }
      ;

elements : value                { $$ = $1; }
         | elements COMMA value { $$ = $3; }
         ;

%%

void yyerror(const char *s) {
  fprintf(stderr, "JSON parse error: %s\n", s);
}

int main(void) {
  int result = yyparse();
  if (result == 0) {
    printf("Valid JSON\n");
  }
  return result;
}
