VERSION 6
BEGIN SCHEMATIC
    BEGIN ATTR DeviceFamilyName "xc9500"
        DELETE all:0
        EDITNAME all:0
        EDITTRAIT all:0
    END ATTR
    BEGIN NETLIST
        SIGNAL XLXN_9
        SIGNAL XLXN_10
        SIGNAL XLXN_11
        SIGNAL CLK
        SIGNAL XLXN_40
        SIGNAL Y
        SIGNAL XLXN_51
        SIGNAL XLXN_52
        SIGNAL XLXN_53
        SIGNAL X1
        SIGNAL X2
        SIGNAL X3
        SIGNAL XLXN_57
        SIGNAL XLXN_58
        SIGNAL XLXN_59
        SIGNAL XLXN_60
        SIGNAL XLXN_61
        SIGNAL XLXN_62
        SIGNAL XLXN_64
        PORT Input CLK
        PORT Output Y
        PORT Input X1
        PORT Input X2
        PORT Input X3
        BEGIN BLOCKDEF and2b2
            TIMESTAMP 2000 1 1 10 10 10
            LINE N 0 -64 40 -64 
            CIRCLE N 40 -76 64 -52 
            LINE N 0 -128 40 -128 
            CIRCLE N 40 -140 64 -116 
            LINE N 256 -96 192 -96 
            ARC N 96 -144 192 -48 144 -48 144 -144 
            LINE N 64 -48 64 -144 
            LINE N 144 -48 64 -48 
            LINE N 64 -144 144 -144 
        END BLOCKDEF
        BEGIN BLOCKDEF and3b1
            TIMESTAMP 2000 1 1 10 10 10
            LINE N 0 -64 40 -64 
            CIRCLE N 40 -76 64 -52 
            LINE N 0 -128 64 -128 
            LINE N 0 -192 64 -192 
            LINE N 256 -128 192 -128 
            LINE N 64 -64 64 -192 
            ARC N 96 -176 192 -80 144 -80 144 -176 
            LINE N 144 -80 64 -80 
            LINE N 64 -176 144 -176 
        END BLOCKDEF
        BEGIN BLOCKDEF and3b2
            TIMESTAMP 2000 1 1 10 10 10
            LINE N 0 -64 40 -64 
            CIRCLE N 40 -76 64 -52 
            LINE N 0 -128 40 -128 
            CIRCLE N 40 -140 64 -116 
            LINE N 0 -192 64 -192 
            LINE N 256 -128 192 -128 
            LINE N 64 -64 64 -192 
            ARC N 96 -176 192 -80 144 -80 144 -176 
            LINE N 144 -80 64 -80 
            LINE N 64 -176 144 -176 
        END BLOCKDEF
        BEGIN BLOCKDEF or3
            TIMESTAMP 2000 1 1 10 10 10
            LINE N 0 -64 48 -64 
            LINE N 0 -128 72 -128 
            LINE N 0 -192 48 -192 
            LINE N 256 -128 192 -128 
            ARC N 28 -256 204 -80 112 -80 192 -128 
            ARC N -40 -184 72 -72 48 -80 48 -176 
            LINE N 48 -64 48 -80 
            LINE N 48 -192 48 -176 
            LINE N 112 -80 48 -80 
            ARC N 28 -176 204 0 192 -128 112 -176 
            LINE N 112 -176 48 -176 
        END BLOCKDEF
        BEGIN BLOCKDEF fd
            TIMESTAMP 2000 1 1 10 10 10
            LINE N 64 -112 80 -128 
            LINE N 80 -128 64 -144 
            LINE N 384 -256 320 -256 
            LINE N 0 -256 64 -256 
            LINE N 0 -128 64 -128 
            RECTANGLE N 64 -320 320 -64 
        END BLOCKDEF
        BEGIN BLOCK XLXI_1 and2b2
            PIN I0 XLXN_62
            PIN I1 XLXN_58
            PIN O XLXN_9
        END BLOCK
        BEGIN BLOCK XLXI_2 and3b1
            PIN I0 XLXN_64
            PIN I1 XLXN_62
            PIN I2 XLXN_58
            PIN O XLXN_10
        END BLOCK
        BEGIN BLOCK XLXI_3 and3b2
            PIN I0 XLXN_64
            PIN I1 XLXN_58
            PIN I2 XLXN_62
            PIN O XLXN_11
        END BLOCK
        BEGIN BLOCK XLXI_4 or3
            PIN I0 XLXN_11
            PIN I1 XLXN_10
            PIN I2 XLXN_9
            PIN O XLXN_40
        END BLOCK
        BEGIN BLOCK XLXI_12 fd
            PIN C CLK
            PIN D XLXN_40
            PIN Q Y
        END BLOCK
        BEGIN BLOCK XLXI_18 fd
            PIN C CLK
            PIN D X1
            PIN Q XLXN_58
        END BLOCK
        BEGIN BLOCK XLXI_19 fd
            PIN C CLK
            PIN D X2
            PIN Q XLXN_62
        END BLOCK
        BEGIN BLOCK XLXI_20 fd
            PIN C CLK
            PIN D X3
            PIN Q XLXN_64
        END BLOCK
    END NETLIST
    BEGIN SHEET 1 3520 2720
        IOMARKER 336 560 X1 R180 28
        IOMARKER 336 832 X2 R180 28
        IOMARKER 336 1056 X3 R180 28
        INSTANCE XLXI_1 1728 672 R0
        INSTANCE XLXI_2 1728 944 R0
        INSTANCE XLXI_3 1728 1152 R0
        BEGIN BRANCH CLK
            WIRE 240 1584 560 1584
            WIRE 560 1584 2592 1584
            WIRE 560 624 592 624
            WIRE 560 624 560 928
            WIRE 560 928 608 928
            WIRE 560 928 560 1216
            WIRE 560 1216 592 1216
            WIRE 560 1216 560 1584
            WIRE 2592 944 2608 944
            WIRE 2592 944 2592 1584
        END BRANCH
        INSTANCE XLXI_12 2608 1072 R0
        BEGIN BRANCH Y
            WIRE 2992 816 3232 816
        END BRANCH
        IOMARKER 3232 816 Y R0 28
        INSTANCE XLXI_18 592 752 R0
        INSTANCE XLXI_19 608 1056 R0
        INSTANCE XLXI_20 592 1344 R0
        BEGIN BRANCH XLXN_40
            WIRE 2352 816 2592 816
            WIRE 2592 816 2608 816
        END BRANCH
        BEGIN BRANCH XLXN_11
            WIRE 1984 1024 2000 1024
            WIRE 2000 1024 2096 1024
            WIRE 2096 880 2096 1024
        END BRANCH
        BEGIN BRANCH XLXN_10
            WIRE 1984 816 2000 816
            WIRE 2000 816 2096 816
        END BRANCH
        BEGIN BRANCH XLXN_9
            WIRE 1984 576 2000 576
            WIRE 2000 576 2096 576
            WIRE 2096 576 2096 752
        END BRANCH
        INSTANCE XLXI_4 2096 944 R0
        IOMARKER 240 1584 CLK R180 28
        BEGIN BRANCH X1
            WIRE 336 560 464 560
            WIRE 464 496 592 496
            WIRE 464 496 464 560
        END BRANCH
        BEGIN BRANCH X2
            WIRE 336 832 464 832
            WIRE 464 800 608 800
            WIRE 464 800 464 832
        END BRANCH
        BEGIN BRANCH X3
            WIRE 336 1056 464 1056
            WIRE 464 1056 464 1088
            WIRE 464 1088 592 1088
        END BRANCH
        BEGIN BRANCH XLXN_58
            WIRE 976 496 1344 496
            WIRE 1344 496 1344 544
            WIRE 1344 544 1456 544
            WIRE 1456 544 1728 544
            WIRE 1456 544 1456 752
            WIRE 1456 752 1728 752
            WIRE 1456 752 1456 1024
            WIRE 1456 1024 1728 1024
        END BRANCH
        BEGIN BRANCH XLXN_62
            WIRE 992 800 1360 800
            WIRE 1360 800 1360 816
            WIRE 1360 816 1520 816
            WIRE 1520 816 1568 816
            WIRE 1568 816 1728 816
            WIRE 1568 816 1568 960
            WIRE 1568 960 1728 960
            WIRE 1520 608 1728 608
            WIRE 1520 608 1520 816
        END BRANCH
        BEGIN BRANCH XLXN_64
            WIRE 976 1088 1456 1088
            WIRE 1456 1088 1472 1088
            WIRE 1472 1088 1728 1088
            WIRE 1472 880 1472 1088
            WIRE 1472 880 1728 880
        END BRANCH
    END SHEET
END SCHEMATIC
