VERSION 6
BEGIN SCHEMATIC
    BEGIN ATTR DeviceFamilyName "virtex2p"
        DELETE all:0
        EDITNAME all:0
        EDITTRAIT all:0
    END ATTR
    BEGIN NETLIST
        SIGNAL XLXN_1
        SIGNAL T_ID(0)
        SIGNAL T_ID(1)
        SIGNAL T_ID(1:0)
        SIGNAL CLR
        SIGNAL CLK
        SIGNAL CE
        PORT Output T_ID(1:0)
        PORT Input CLR
        PORT Input CLK
        PORT Input CE
        BEGIN BLOCKDEF ftce
            TIMESTAMP 2000 1 1 10 10 10
            LINE N 192 -32 64 -32 
            LINE N 192 -64 192 -32 
            LINE N 80 -128 64 -144 
            LINE N 64 -112 80 -128 
            LINE N 384 -256 320 -256 
            LINE N 0 -256 64 -256 
            LINE N 0 -32 64 -32 
            LINE N 0 -192 64 -192 
            LINE N 0 -128 64 -128 
            RECTANGLE N 64 -320 320 -64 
        END BLOCKDEF
        BEGIN BLOCKDEF vcc
            TIMESTAMP 2000 1 1 10 10 10
            LINE N 64 -32 64 -64 
            LINE N 64 0 64 -32 
            LINE N 96 -64 32 -64 
        END BLOCKDEF
        BEGIN BLOCK I_Q1 ftce
            PIN C CLK
            PIN CE CE
            PIN CLR CLR
            PIN T T_ID(0)
            PIN Q T_ID(1)
        END BLOCK
        BEGIN BLOCK I_Q0 ftce
            PIN C CLK
            PIN CE CE
            PIN CLR CLR
            PIN T XLXN_1
            PIN Q T_ID(0)
        END BLOCK
        BEGIN BLOCK I_36_9 vcc
            PIN P XLXN_1
        END BLOCK
    END NETLIST
    BEGIN SHEET 1 3520 2720
        INSTANCE I_Q1 896 2080 R0
        INSTANCE I_Q0 896 1504 R0
        INSTANCE I_36_9 448 1248 R0
        BEGIN BRANCH XLXN_1
            WIRE 512 1248 896 1248
        END BRANCH
        BEGIN BRANCH T_ID(1:0)
            WIRE 2528 1136 2752 1136
            WIRE 2528 1136 2528 1232
            WIRE 2528 1232 2528 1248
            WIRE 2528 1248 2528 1824
            WIRE 2528 1824 2528 1872
        END BRANCH
        BUSTAP 2528 1248 2512 1248
        BUSTAP 2528 1824 2512 1824
        BEGIN BRANCH CLR
            WIRE 560 2048 672 2048
            WIRE 672 2048 896 2048
            WIRE 672 1472 672 2048
            WIRE 672 1472 896 1472
        END BRANCH
        BEGIN BRANCH CLK
            WIRE 560 1952 656 1952
            WIRE 656 1952 896 1952
            WIRE 656 1376 656 1952
            WIRE 656 1376 896 1376
        END BRANCH
        BEGIN BRANCH CE
            WIRE 560 1888 640 1888
            WIRE 640 1888 896 1888
            WIRE 640 1312 640 1888
            WIRE 640 1312 896 1312
        END BRANCH
        IOMARKER 560 1888 CE R180 28
        IOMARKER 560 1952 CLK R180 28
        IOMARKER 560 2048 CLR R180 28
        IOMARKER 2752 1136 T_ID(1:0) R0 28
        BEGIN BRANCH T_ID(1)
            WIRE 1280 1824 1840 1824
            WIRE 1840 1824 2320 1824
            WIRE 2320 1824 2512 1824
            BEGIN DISPLAY 2320 1824 ATTR Name
                ALIGNMENT SOFT-BCENTER
            END DISPLAY
        END BRANCH
        BEGIN BRANCH T_ID(0)
            WIRE 704 1568 1504 1568
            WIRE 704 1568 704 1824
            WIRE 704 1824 896 1824
            WIRE 1280 1248 1504 1248
            WIRE 1504 1248 1504 1568
            WIRE 1504 1248 1680 1248
            WIRE 1680 1248 2320 1248
            WIRE 2320 1248 2512 1248
            BEGIN DISPLAY 2320 1248 ATTR Name
                ALIGNMENT SOFT-BCENTER
            END DISPLAY
        END BRANCH
    END SHEET
END SCHEMATIC
