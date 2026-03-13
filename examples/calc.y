%{
#include <stdio.h>
#include <math.h>
%}

%token <double> NUMBER
%token <std::string> IDENTIFIER
%token PLUS "+"
%token MINUS "-"
%token TIMES "*"
%token DIVIDE "/"
%token LPAREN "("
%token RPAREN ")"
%token ASSIGN "="
%token SEMICOLON ";"

%type <double> expr term factor program stmt

%left PLUS MINUS
%left TIMES DIVIDE

%start program

%%

program : stmt SEMICOLON { $$ = $1; }
        | program stmt SEMICOLON { $$ = $2; }
        ;

stmt : IDENTIFIER ASSIGN expr { $$ = $3; }
     | expr { $$ = $1; }
     ;

expr : expr PLUS term   { $$ = $1 + $3; }
     | expr MINUS term  { $$ = $1 - $3; }
     | term             { $$ = $1; }
     ;

term : term TIMES factor  { $$ = $1 * $3; }
     | term DIVIDE factor { $$ = $1 / $3; }
     | factor             { $$ = $1; }
     ;

factor : NUMBER          { $$ = $1; }
       | LPAREN expr RPAREN { $$ = $2; }
       | MINUS factor    { $$ = -$2; }
       ;

%%

void yyerror(const char *s) {
    fprintf(stderr, "Error: %s\n", s);
}
