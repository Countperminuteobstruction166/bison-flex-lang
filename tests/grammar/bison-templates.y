// SYNTAX TEST "source.bison"

%token <std::vector<int>> VEC_TOKEN
//     ^^^^^^^^^^^^^^^^^^
//     entity.name.type.bison

%type <std::map<int,std::string>> expr_list
//    ^^^^^^^^^^^^^^^^^^^^^^^^^^
//    entity.name.type.bison

%%

rule : VEC_TOKEN {
    $<std::vector<int>>1;
//  ^^^^^^^^^^^^^^^^^^^^
//  variable.language.semantic-value.bison
    /* } pas de drift */
    std::string s = "}";
//                  ^^^
//                  string.quoted.double.cpp.bison
} ;
